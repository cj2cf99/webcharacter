import {readRefusalExcerpt,refusalExcerpt} from './refusal-response.mjs';

// Host credentials stay with the existing AI pool. The API Worker receives one provider reply at a time.
export function createRegistrationAiGateway(env, {
  AI_PRIORITY, AI_MODELS, createAiClient, createAdapters, createEnvCredentialResolver, runPaidProbe,
}, {fetcher = fetch, timeoutMs = 10000} = {}) {
  const providers = [...new Set([...AI_PRIORITY, ...Object.keys(AI_MODELS)]), 'deepseek'].filter(provider => provider !== 'bigmodel');
  const routes = Object.fromEntries(providers.filter(provider => provider !== 'deepseek').map(provider =>
    ['registration.' + provider, {provider, maxOutputTokens: 2048}]));
  const resolveCredential=createEnvCredentialResolver(env);
  return {
    providers: () => providers,
    async attempt(provider, input) {
      let copy, bindingReply;
      const secrets=[];
      const capture=async(url,options)=>{
        const headers=new Headers(options.headers);
        for(const key of ['authorization','x-api-key','x-goog-api-key']){
          const value=headers.get(key)?.replace(/^(?:Bearer|Basic)\s+/i,'');
          if(value)secrets.push(value);
        }
        const response=await fetcher(url,options);
        copy=response.clone();
        return response;
      };
      try {
        if (provider === 'deepseek') {
          return {value: await runPaidProbe({env, fetcher:capture, timeoutMs, messages: input.messages,
            maxOutputTokens: input.maxOutputTokens, allowPartialText: true})};
        }
        if (!Object.hasOwn(routes, 'registration.' + provider)) return {error: 'NOT_CONFIGURED'};
        const client=createAiClient({routes,timeoutMs,adapters:createAdapters({fetcher:capture,cloudflareThinking:false}),
          resolveCredential:async name=>{
            const credential=await resolveCredential(name);
            if(credential.kind!=='binding')return credential;
            return {...credential,async run(...args){
              try{bindingReply=await credential.run(...args);return bindingReply;}
              catch(e){bindingReply=e?.message;throw e;}
            }};
          }});
        return {value: await client.generate({...input, route: 'registration.' + provider})};
      } catch (error) {
        const {upstreamStatus, providerCode} = error?.diagnostic ?? {};
        const excerpt=copy?await readRefusalExcerpt(copy,secrets):refusalExcerpt(typeof bindingReply==='string'?bindingReply:JSON.stringify(bindingReply));
        return {error: error?.code || 'AI_UNAVAILABLE', model: provider === 'deepseek' ? 'deepseek-flash' : AI_MODELS[provider],
          upstream_status: upstreamStatus, provider_code: providerCode, refusal_response:excerpt};
      }finally{if(copy?.body&&!copy.body.locked)void copy.body.cancel().catch(()=>{});}
    },
  };
}

export function createRegistrationAiEntrypoint(WorkerEntrypoint, dependencies, options) {
  return class RegistrationAi extends WorkerEntrypoint {
    providers() { return createRegistrationAiGateway(this.env, dependencies, options).providers(); }
    attempt(provider, input) { return createRegistrationAiGateway(this.env, dependencies, options).attempt(provider, input); }
  };
}
