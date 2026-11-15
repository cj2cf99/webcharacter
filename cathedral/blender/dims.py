# 巴黎圣母院尺寸常量（米）。每个数都注明出处，出处编号见 docs/DESIGN.md 第 1 节。
# 坐标：X 横向（北为负、南为正），Y 沿长轴（西立面最前缘 y=0，向东为正），Z 向上，地面 z=0。
#
# 平面数据取自 1861 年平面图（reference/ 中的 D.14500-14）实测：
#   比例 S = 127 m / 6120 px = 0.02075 m/px；中轴 px_x = 1898.5；西立面前缘 px_y = 6310。
#   换算：x = (px_x - 1898.5) * S，y = (6310 - px_y) * S。

S = 0.02075

def px(x_px, y_px):
    """1861 年平面图像素 → 场景米坐标。"""
    return ((x_px - 1898.5) * S, (6310 - y_px) * S)

# ---------- 平面：横向线（左右对称取平均）----------
ARC_X = 6.90           # 主连拱柱心（图：1566 / 2231 px）
AISLE_PIER_X = 12.80   # 侧廊中间柱列（图：1282 / 2516 px）
AISLE_WALL_X = 18.65   # 外侧廊外墙 = 礼拜堂内口（图：扶壁内端约 1000 / 2800 px）
CHAPEL_OUT_X = 23.50   # 礼拜堂外墙（图：742 / 3007 px，合计 47.0 m）
TRANSEPT_OUT_X = 24.70 # 耳堂外缘（图：703 / 3082 px，合计 49.4 m）
TOWER_OUT_X = 20.50    # 塔楼主体外墙（图：868 / 2875 px，合计 41.0 m，与官方 41 m 一致）
TOWER_BASE_X = 23.55   # 塔楼基座两侧外凸（图：714 / 2982 px，合计 47.1 m）
FRONT_BUTTRESS_X = 19.8  # 正面扶壁前缘（图：901 / 2809 px，合计 39.6 m）

# ---------- 平面：纵向（柱心 y）----------
TOWER_DEPTH = 16.0       # 塔楼进深（图：塔楼柱 5600 px → 14.7 m，加半个柱宽，推算）
NAVE_PIERS_Y = [9.5, 14.7, 20.3, 25.9, 31.5, 36.8, 42.2, 47.4, 52.9]   # 图：中殿柱列，塔楼下 2 个开间 + 8 个开间
CROSS_W_Y = 59.2         # 交叉口西侧柱（图：3459 px）
CROSS_E_Y = 74.1         # 交叉口东侧柱（图：2740 px）
CHOIR_PIERS_Y = [81.5, 86.8, 92.2, 97.6, 102.6]   # 图：唱诗区直段柱列
APSE_CY = 102.6          # 半圆后殿圆心（取最后一排直段柱）
# 后殿各圈的半轴（rx 横向，ry 向东）。图上实测：主连拱圈 rx 6.5–6.9 / ry 约 7.2；
# 内回廊柱圈 rx 11.8 / ry 12.9；外缘 rx 23.5 / ry 24.1（东端 y≈126.7，与总长 127 m 吻合）
APSE_ARC = (ARC_X, 7.2)
APSE_AISLE = (AISLE_PIER_X, 12.9)
APSE_WALL = (AISLE_WALL_X, 18.9)     # 外回廊外墙：按前两圈比例推算
APSE_OUT = (CHAPEL_OUT_X, 24.1)
TRANSEPT_Y0, TRANSEPT_Y1 = 57.0, 76.3   # 耳堂南北臂的东西两墙外缘（图：扶壁 3450 / 2662 px 附近，推算墙厚）

# 西立面门洞（图：门洞两侧墩体之间的净宽）
PORTAL_C = (0.0, 5.6)        # 中门：中心 x、净宽
PORTAL_SIDE_X = 13.3         # 侧门中心 |x|（图：1130–1370 px 的中点）
PORTAL_SIDE_W = 5.0

# ---------- 高度 ----------
VAULT_CROWN = 33.0      # 主拱顶内高：官方 33 m；Fletcher 剖面实测 33.4 m
VAULT_SPRING = 24.3     # 主拱起拱：Fletcher 标注 79 英尺
ARCADE_CROWN = 11.0     # 连拱拱顶：Fletcher 标注 36 英尺 6 英寸
TRIBUNE_FLOOR = 11.3    # 楼廊地面：Fletcher 剖面实测
TRIBUNE_VAULT = 20.3    # 楼廊拱顶：Fletcher 剖面实测
AISLE_VAULT = 10.6      # 侧廊拱顶：Fletcher 剖面实测
HIGH_WALL_TOP = 35.0    # 主墙顶：拱顶 33 m 加拱背厚度，推算
ROOF_RIDGE = 43.0       # 屋脊：官方“中殿屋顶下高度 43 m”，按屋脊处理（推算）
TRIBUNE_WALL_TOP = 21.5 # 楼廊外墙顶：Fletcher 剖面实测
CHAPEL_WALL_TOP = 14.0  # 外侧廊/礼拜堂外墙顶：Fletcher 剖面实测
FACADE_TOP = 45.0       # 立面到塔基：官方 45 m
TOWER_TOP = 69.0        # 塔顶：官方 69 m
SPIRE_TOP = 96.0        # 尖塔：官方 96 m
SPIRE_BASE_R = 3.6      # 尖塔八角塔身半径：Fletcher 插图 B 实测宽高比 0.137 × 屋脊以上 53 m ≈ 7.2 m 宽（透视图，±15%）
SPIRE_DRUM_TOP = 64.0   # 八角塔身顶：同图，塔身占屋脊以上高度约 40%（Viollet-le-Duc 尖塔图分段一致）
SPIRE_NEEDLE_R = 2.45   # 尖锥起始半径：同图约 4.9 m 宽

# ---------- 西立面细部 ----------
# 高度：照片“L'église Notre-Dame face Paris”（约 1900–1920，Centre des monuments nationaux，Licence Ouverte，
#   维基共享资源）正面远景实测。标定：立面底脚 = 0 m、塔顶栏杆 = 69 m（官方），约 16.3 px/m。
#   校验：玫瑰窗直径量得约 9.5 m，官方 9.70 m（差 2%）；两塔间栏杆顶 47 m，官方立面 45 m（差 4.7%）。读数误差约 ±0.5 m。
# 横向：1861 年平面图，正面四道扶壁中心 x px ≈ 947 / 1536 / 2223 / 2753（左右略不对称，取平均）。
F_BUTT_IN = 7.1         # 内侧扶壁中心 |x|
F_BUTT_OUT = 18.7       # 外侧扶壁中心 |x|
F_BUTT_W = 2.0          # 扶壁宽（图：约 95–113 px）
F_BUTT_PROJ = 1.6       # 扶壁前凸（图：扶壁前缘到墙面，推算）
PORTAL_C_CROWN = 16.0   # 中门外拱拱顶（照片）
PORTAL_S_CROWN = 13.5   # 侧门外拱拱顶（照片）
PORTAL_SPRING = 7.5     # 门洞起拱（照片：门楣上缘，推算 ±0.5）
PORTAL_DOOR_H = 7.5     # 门扇高（照片：门楣下缘）
PORTAL_STEPS = 6        # 拱券层数（照片目视，推算）
KINGS_Z0, KINGS_Z1 = 18.0, 23.0   # 国王廊（照片）；像高约 3.5–4 m（照片，与单一来源 3.5 m 一致）
KINGS_N = 28            # 官方/多个来源一致
VIRGIN_BAL_Z = 24.3     # 圣母廊栏杆底（照片）
ROSE_CZ = 29.5          # 玫瑰窗中心（照片）
ROSE_R = 9.70 / 2       # 官方直径
SIDE_WIN_Z0, SIDE_WIN_Z1 = 25.5, 34.5   # 两侧双尖窗及上方圆窗的外拱（照片）
GALLERY_Z0, GALLERY_Z1 = 37.0, 45.0     # 大连拱廊（照片）
TOP_BAL_Z0, TOP_BAL_Z1 = 45.0, 47.0     # 塔基栏杆（照片；官方立面高 45 m）
BELFRY_Z0, BELFRY_Z1 = 51.5, 63.0       # 钟楼双尖窗（照片）
BELFRY_W, BELFRY_DX = 1.15, 2.1         # 尖窗半宽、中心距塔面中线（照片：窗宽约占塔面 18%）
TOWER_TOP_BAL = 67.5                    # 塔顶栏杆底（照片），顶 69 m（官方）
