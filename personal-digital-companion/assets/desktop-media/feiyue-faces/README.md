# 绯月表情资源

B 是用户选定的形象基准，用于专聊菜单和待处理。A 作为独立资源保留。表情沿用 B 的脸型、发髻、红白花饰、额纹、红瞳和领花。两套各七张独立透明底 PNG，[文件索引](manifest.json)和[表情预览](../../../prototype/private-chat/expressions.html)可逐一查找。

## 生成提示词

通过内置 imagegen 生成。A 和 B 从用户确认的并排设计生成各自的透明底头像。后续 14 张统一引用 B。共同提示词及各表情差异如下：

> Create exactly one standalone transparent PNG expression icon for the adult chibi character Feiyue. Use the supplied image as the exact identity and art-direction reference, not a request to change the original. Identity locked: same face shape and proportions, red eyes, hair color and swept red-brown updo, paired red and cream flowers with golden centers, gold pin, red ribbon, same four red forehead diamonds, drop earrings, same little flower collar, same crisp warm anime sticker outlines and shading. The whole original head-and-collar silhouette should fit inside an equal square, closely framed but no clipped pin or hair, eye line in the lower central area matching the reference. Head and neck only, no arms or lower body, no lettering. Real transparent alpha. No backdrop, lettering or second portrait.

- 傲慢（`sins/pride.png`） chin held slightly up, looking down the bridge of her nose, half-lidded assured gaze and one raised brow, single restrained asymmetrical smirk, self-satisfied and regal, no crown
- 嫉妒（`sins/envy.png`） a clear tense sidelong glare with both pupils toward viewer-left, one inward-lowered eyebrow, cheeks drawn tight and pursed crooked mouth, a very subtle cool green reflection at the eye edges with irises still scarlet, upset at someone else getting attention
- 暴怒（`sins/wrath.png`） an intensely furious head with sharply converging eyebrows, blazing wide red eyes and bared tightly clenched teeth, face slightly flushed red, a tiny red anime anger pulse beside the outer temple distinctly separated from the original forehead mark
- 怠惰（`sins/sloth.png`） contentedly idle and drowsy, relaxed asymmetric heavy lids, one eyebrow loose, small unconcerned lazy smirk, head tilted gently to one side, one tiny drifting sleep bubble with no lettering, preserve healthy blush and no under-eye bags
- 贪婪（`sins/greed.png`） calculating possessive grin and focused open red eyes with small golden glints, eyes fixed on exactly one tiny gold coin near the chin at the edge of the icon, coin has no written mark and doesn't cover her face, expectant acquisitiveness, preserve pose and accessories
- 暴食（`sins/gluttony.png`） rounded puffed cheeks and concentrated gleeful chewing, both red eyes visibly delighted, one very small pale round pastry by the lower edge of her mouth without obscuring the eyes or original collar, a light crumb near lip, playful overeager appetite
- 色欲（`sins/lust.png`） flirtatious adult expression with long half-closed red eyes meeting the viewer, strong soft pink flush, tilted head and gently parted teasing smile. One tiny rosy heart-shaped glint near the cheek. A romantic expression conveyed through a head icon only. Clothing stays identical
- 喜（`emotions/joy.png`） gentle genuine delight on receiving good news, open smiling red eyes, lifted brows, rosy cheeks, clear compact closed smile with gently raised cheeks. Soft gleam in eyes, no props or outside effects
- 怒（`emotions/anger.png`） irritated everyday anger, drawn-in eyebrows and red eyes slightly narrowed, forehead slightly tensed and mouth firmly pinched, faint cheek flush. A direct admonishing expression, clean silhouette without external marks or effects
- 哀（`emotions/sorrow.png`） clear sadness, inner brows raised, mouth corners dropped, glossy downcast red eyes with one small transparent tear sliding along her cheek, gentle and restrained
- 乐（`emotions/amusement.png`） unmistakable open laughter, both eyes closed in upturned happy crescents, eyebrows loosely raised, mouth wide with rounded open laugh, rosy cheeks and head a little lifted, no notes or extra symbols
- 平淡（`emotions/neutral.png`） neutral resting expression, symmetrical fully open red eyes looking calmly straight ahead, straight relaxed brows, mouth a short straight closed line, very light normal blush, centered upright head
- 激动（`emotions/excited.png`） unmistakably excited with wide brilliant scarlet eyes, raised eyebrows and an open rounded smile as she exclaims, vivid pink cheeks, two short golden emphasis strokes beside her upper hair kept small, no separate objects
- 疲惫（`emotions/tired.png`） visibly worn out after a long day, both eyes half-lidded and looking down, slight desaturated under-eye shadows, relaxed brows and small flattened mouth with a soft sigh, head dipping a little, no sleep symbols, do not age her
