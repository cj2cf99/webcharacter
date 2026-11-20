# 二维素材来源与生成提示词

2026-11-16（Asia/Tokyo）。本轮使用内置 `image_gen.imagegen`，没有调用 API/CLI，不需要用户密钥。输出均保留真实 alpha，不使用既有 3D 模型渲染帧。素材由生成工具制作，不是真实鸟的摄影证据；生物学核对另外参考 README 中的真实 GIF/博物馆资料。

## male-atlas-v1.png

用途：拆成侧头颈、正头颈、躯干折翼、尾羽四层，由 Canvas 控制转头、呼吸、遮挡和开合。来源参考图 `model/bird/reference/turnaround-20261115.png` 用作解剖外观引导，没有直接随网页加载。

大小：1,159,543 字节。SHA-256：`D2C5A01E9B077CD2E54996BCFCD6FF588986B636E486410503C7FE4E26639BC2`。

最终提示词：

> Create a production quality photorealistic 2D cutout animation ATLAS with genuine transparent background, square canvas 1536 x1536 or 1024x1024. Reference image is only anatomical guidance for male greater superb bird-of-paradise Lophorina superba. This atlas contains FOUR isolated disconnected parts in a perfectly regular 2 by 2 grid, no borders, no lettering, no labels, no checkerboard painted into image. EACH PART must fit fully inside its own quarter with generous transparent margins, no overlap. Top left quadrant: head AND thick short neck together, male black superb bird, three quarter left view, narrow gently curved black beak pointing LEFT near horizontal, glossy small realistic eye, tiny turquoise crown patch, head round and tall, soft extremely fine velvet black plumage, neck cut horizontally at base with feather edge, no breast shield, no torso. Top right quadrant: SAME male head AND short neck together FRONT VIEW, beak centered pointing toward viewer, two visible realistic eyes, two small turquoise crown patches, neck cut same height as other head. Bottom left quadrant: ONLY the oval torso with folded wings, black short velvety breast and abdomen, dark subtly outlined layered long wing feathers around its sides, FRONT THREE QUARTER view angled very slightly left, NO head, NO neck, NO legs, NO feet, NO tail, NO blue breast shield. Shoulder tops rounded and feathered, tapered fluffy belly bottom. Bottom right quadrant: ONLY an isolated narrow bundle of black long TAIL feathers, vertically downwards, connected feather roots at top, rounded tapering tips at bottom. Lighting consistent soft forest diffuse from upper left, restrained real black plumage with finest natural texture, no shiny metal, no cartoon, no drawn outlines, no circular radial feather rings, no decorative elements. High fidelity wildlife photography material for realtime 2D puppet animation. Real alpha cutouts, not complete birds. Four objects total.

## breast-shield-v1.png

用途：胸盾的二维羽毛纹理，随收拢/展开参数改变宽高。大小：1,963,469 字节。SHA-256：`99085A28B06E8B3F02A2DD2B21F1E7CCCDEFD4B4D96F4E7E0F9D0DA8AB461387`。

最终提示词：

> Use case: photorealistic-natural. Create one isolated wildlife anatomy 2D animation asset on genuine transparent background: ONLY the fully spread iridescent blue turquoise BREAST SHIELD feathers of a male greater superb bird-of-paradise (Lophorina superba), frontal view. No bird body, no head, no wings, no eyes, no neck, no legs. The shield is a wide shallow curved fan, thin pointed ends sweeping slightly up, broad rounded center drooping down like a shallow curved smile or a wide rounded triangle. Overall width about 5 times its center depth. Closely overlapping hundreds of TINY natural rounded individual contour feathers arranged in irregular gently arcing rows, very fine visible feather barb texture, no straight comb stripes. Intense but physically credible natural iridescence: electric cyan center, deeper cobalt and turquoise blue around the gently curved tips. Fine dark feather seams, extremely soft outdoor diffuse light, wildlife macro photography realism. Large centered object with transparent margins on all sides, no text, no shadow, no border, no black body. This is a separate cutout texture for a 2D puppet, not a diagram.

其它：背景、树干、脚爪及披肩为代码生成。没有下载或随网页分发参考视频、GIF、用户原参考图，也没有新增字体或 CDN 请求。
