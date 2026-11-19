# 绯月云端开发数据库

这三份 SQLite 文件可以直接打开。需要在库里执行写入时，先复制到未跟踪的 `output/`，保留仓库中的基线。

| 文件 | 内容 |
| --- | --- |
| `desktop-tasks.sqlite` | 桌面执行库的四张表，初始为空 |
| `companion-d1.sqlite` | 绯月任务 D1，包含正式迁移及六项登记模板 |
| `main-d1.sqlite` | 主站完整表结构，含合成提醒、日记、随手记和胡适登记样例 |

数据库由正式结构和版本库种子重新构建。样例不含本机个人记录、设备身份、凭据和任务历史。主站样例的参考日期为 2026-11-20 JST。双 Worker 预览会为当前 JST 日期准备逾期、当天和不可改动等场景。

## 云端验证

检出 `webcharacter`、`cloudflaremyapp` 和 `informationmanager` 的 `main`，进入 `webcharacter/personal-digital-companion`。以下命令使用 Node.js 24。按云端实际签出目录设置两个路径。

```sh
export FEIYUE_MAIN_DIR=/workspace/cloudflaremyapp/myapp
export FEIYUE_API_DIR=/workspace/informationmanager/api-worker
export COMPANION_HU_SHI_MAIN_SOURCE="$FEIYUE_MAIN_DIR"

node tools/dev-databases.mjs
node --test agent/tests/*.test.mjs
npm ci --prefix "$FEIYUE_MAIN_DIR"
node tools/release-preview.mjs
```

第一条 Node 命令重新用正式 SQL 生成内存库，只读核对这三份 SQLite 的表结构、种子、完整性及外键。最后一条命令用两个隔离的 workerd Worker 和临时 D1 运行登记和提醒端到端测试，使用合成 Access 身份和模拟 AI。它会从已签出的 SQL 初始化隔离环境。

需要交互时，在同一环境显式运行 `node tools/release-preview.mjs --serve`，通过本机或云端端口转发访问 `http://127.0.0.1:8788/preview/today/` 和 `http://127.0.0.1:8788/companion/chains/`。

更新结构或种子后，可以在一个新目录重建这三份文件。生成器会拒绝覆盖其中已存在的数据库。

```sh
node tools/dev-databases.mjs --output output/dev-databases
```
