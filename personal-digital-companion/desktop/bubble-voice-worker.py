"""绯月本机气泡的 Paraformer 听写和 GPT-SoVITS 朗读进程。"""

import base64
import io
import json
import os
from pathlib import Path
import sys
import wave


mode, runtime_arg, reference_arg, cache_arg = sys.argv[1:]
runtime = Path(runtime_arg)
reference = Path(reference_arg)
cache = Path(cache_arg)
wire = sys.stdout
sys.stdout = sys.stderr
engine = None


def load_recognizer():
    global engine
    if engine is None:
        import _distutils_hack

        _distutils_hack.add_shim()
        from funasr import AutoModel

        models = runtime / 'tools/asr/models'
        paths = {
            'model': models / 'speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch',
            'vad_model': models / 'speech_fsmn_vad_zh-cn-16k-common-pytorch',
            'punc_model': models / 'punc_ct-transformer_zh-cn-common-vocab272727-pytorch',
        }
        if any(not (path / 'model.pt').is_file() for path in paths.values()):
            raise ValueError('本机 Paraformer 或其标点模型文件缺失。')
        engine = AutoModel(**{key: str(path) for key, path in paths.items()}, device='cpu', ncpu=4,
                           disable_update=True, disable_pbar=True, trust_remote_code=False)
    return engine


def recognize(audio):
    import numpy as np

    with wave.open(io.BytesIO(base64.b64decode(audio, validate=True)), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
            raise ValueError('需要 16 kHz 单声道 PCM WAV。')
        count = wav.getnframes()
        if not 1600 <= count <= 8 * 16000:
            raise ValueError('录音段长度无效。')
        frames = wav.readframes(count)
        if len(frames) != 2 * count:
            raise ValueError('录音段数据不完整。')
    samples = np.frombuffer(frames, dtype='<i2').astype(np.float32) / 32768
    if np.max(np.abs(samples)) < .003:
        return {'text': ''}
    result = load_recognizer().generate(input=samples, cache={})
    return {'text': result[0].get('text', '').strip() if result else ''}


def synthesize(text):
    global engine
    audio = reference / 'elysia_01.wav'
    prompt_file = reference / 'prompt.txt'
    if not audio.is_file() or not prompt_file.is_file():
        raise ValueError('找不到本机 GPT-SoVITS 的参考音频或参考文本。')
    prompt = prompt_file.read_text(encoding='utf-8-sig').strip()
    if not prompt:
        raise ValueError('本机 GPT-SoVITS 的参考文本为空。')

    import numpy as np
    import soundfile as sf

    if engine is None:
        sys.path.insert(0, str(runtime))
        from tools.portable_runtime import activate

        activate(change_cwd=True)
        import torch
        from TTS_infer_pack.TTS import TTS, TTS_Config

        torch.set_num_threads(4)
        dedicated_gpu = os.environ.get('FEIYUE_TTS_DEVICE') == 'gpu'
        cuda = torch.cuda.is_available()
        if dedicated_gpu:
            if not cuda:
                raise ValueError('专聊语音需要 CUDA。')
            free, total = torch.cuda.mem_get_info()
            if free < 3700 * 1024**2:
                raise ValueError('专聊语音没有足够的显存，请等 GPU 空闲后重试。')
            torch.cuda.set_per_process_memory_fraction(3072 * 1024**2 / total, 0)
        else:
            cuda = cuda and torch.cuda.mem_get_info()[0] >= 5800 * 1024**2
        options = dict(TTS_Config.default_configs['v5turbo'], device='cuda:0' if cuda else 'cpu', is_half=cuda)
        config = TTS_Config({'custom': options})
        config.configs_path = str(cache / 'gpt-tts-config.yaml')
        engine = TTS(config)
    generation = engine.run({
        'text': text, 'text_lang': 'zh', 'ref_audio_path': str(audio),
        'prompt_text': prompt, 'prompt_lang': 'zh', 'text_split_method': 'cut0',
        'sample_steps': 4, 'fragment_interval': 0.15, 'seed': 42,
    })
    try:
        rate, samples = next(generation)
    finally:
        generation.close()
    if not len(samples) or not np.isfinite(samples).all() or np.max(np.abs(samples.astype(np.float32))) < .001:
        raise ValueError('语音合成未返回有效音频。')
    buffer = io.BytesIO()
    sf.write(buffer, samples, rate, format='WAV', subtype='PCM_16')
    return {'wav': base64.b64encode(buffer.getvalue()).decode('ascii')}


for line in sys.stdin:
    request = json.loads(line)
    try:
        if mode == 'asr' and request.get('preheat') is True:
            load_recognizer()
            result = {'ready': True}
        else:
            result = recognize(request['audio']) if mode == 'asr' else synthesize(request['text'])
    except (ValueError, wave.Error, EOFError) as error:
        result = {'error': str(error)}
    except Exception:
        result = {'error': '本机语音录入失败，请重试。' if mode == 'asr' else '本机 GPT-SoVITS 合成失败，请重试。'}
    print(json.dumps({'id': request['id'], **result}, ensure_ascii=False), file=wire, flush=True)
