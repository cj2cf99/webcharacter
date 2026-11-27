import { Store, Fault, assert, uid, TABLES } from "./store.mjs";
import {
  LIMITS,
  fields,
  str,
  validateAsset,
  validateQuestion,
  validateTag,
  page,
  QUESTION_FIELDS,
} from "./validation.mjs";
import {
  newSession,
  sessionDTO,
  command,
  expire,
  itemsFor,
} from "./sessions.mjs";
import {
  previewImport,
  advanceImport,
  updateQuestion,
  stats,
  analysisData,
  AI_PROMPT,
} from "./exchange.mjs";

const PREFIX = "/api/study/v1";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function hash(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const entity = (data, now) => ({
  id: uid(),
  revision: 1,
  created_at: now,
  updated_at: now,
  ...data,
});
function matchRevision(req, d) {
  assert(
    req.headers.get("If-Match") === String(d.revision),
    "REVISION_CONFLICT",
    "请重新读取记录并以当前revision更新",
    409,
  );
}
function edit(req, d, b, allowed, now) {
  matchRevision(req, d);
  fields(b, allowed);
  Object.assign(d, b, { revision: d.revision + 1, updated_at: now });
  return d;
}
function summary(s, x, now) {
  const d = sessionDTO(s, x, now);
  delete d.items;
  return d;
}
function getJob(s, id) {
  const j = s.get("import_jobs", id);
  return {
    ...j,
    images: j.images.map(({ data_base64, ...a }) => a),
    rows: s
      .all("import_rows")
      .filter((r) => r.job_id === id)
      .sort((a, b) => a.row_no - b.row_no)
      .slice(0, 50),
  };
}
export async function handleAPI(
  req,
  db,
  owner,
  {
    now = () => Date.now(),
    origin = new URL(req.url).origin,
    desktopExamOnly = false,
  } = {},
) {
  const requestId = uid();
  try {
    const url = new URL(req.url);
    assert(
      url.pathname.startsWith(PREFIX + "/"),
      "NOT_FOUND",
      "接口不存在",
      404,
    );
    const method = req.method,
      write = !["GET", "HEAD"].includes(method);
    if (write) {
      assert(
        req.headers.get("Origin") === origin,
        "ORIGIN_REJECTED",
        "写入请求必须来自本站",
        403,
      );
      assert(
        req.headers.get("Content-Type")?.includes("application/json"),
        "JSON_REQUIRED",
        "请使用application/json",
        400,
      );
    }
    const raw = write ? await readBounded(req, LIMITS.request_bytes) : "";
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Fault(400, "INVALID_JSON", "JSON格式错误");
    }
    assert(
      body && typeof body === "object" && !Array.isArray(body),
      "INVALID_JSON",
      "请求体必须为JSON对象",
      400,
    );
    const key = req.headers.get("Idempotency-Key") || body.client_op_id;
    if (write) {
      str(key, "Idempotency-Key");
      assert(
        !body.client_op_id || body.client_op_id === key,
        "OP_KEY_MISMATCH",
        "命令与请求幂等键不一致",
        400,
      );
    }
    const fingerprint = write
      ? await hash(
          method +
            " " +
            url.pathname +
            " " +
            raw +
            " " +
            (req.headers.get("If-Match") || ""),
        )
      : null;
    const path = url.pathname.slice(PREFIX.length).split("/").filter(Boolean);
    for (let retry = 0; retry < 4; retry++) {
      const s = await new Store(db, owner).load();
      const time = now();
      // Commit elapsed timers even when a subsequent write is rejected. No late patch.
      const was = s
        .all("sessions")
        .map((x) => x.status)
        .join();
      expire(s, time);
      if (
        was !==
        s
          .all("sessions")
          .map((x) => x.status)
          .join()
      ) {
        try {
          await s.commit();
        } catch (e) {
          if (e.code === "CONCURRENT_WRITE") continue;
          throw e;
        }
        continue;
      }
      if (desktopExamOnly && path[0] === "sessions") {
        requireDesktopExam(s, path[1], method, body);
      }
      if (write) {
        const old = s.all("operations").find((o) => o.client_op_id === key);
        if (old) {
          assert(
            old.request_hash === fingerprint,
            "IDEMPOTENCY_REUSE",
            "相同幂等键不能用于不同请求",
            409,
          );
          return old.http_status === 204
            ? new Response(null, { status: 204 })
            : json(storedReply(old.response), old.http_status);
        }
        if (!s.data.users.has(owner))
          s.put("users", {
            id: owner,
            access_subject: owner,
            created_at: time,
          });
      }
      const { data, status = 200 } = await route(
        s,
        path,
        method,
        body,
        req,
        url.searchParams,
        time,
        desktopExamOnly,
      );
      if (write)
        s.put("operations", {
          id: uid(),
          client_op_id: key,
          request_hash: fingerprint,
          response: data,
          http_status: status,
          created_at: time,
        });
      try {
        await s.commit();
        return status === 204
          ? new Response(null, { status: 204 })
          : json(data, status);
      } catch (e) {
        if (e.code === "CONCURRENT_WRITE" && retry < 3) continue;
        throw e;
      }
    }
    throw new Fault(409, "BUSY", "数据正在更新，请稍后重试");
  } catch (e) {
    const status = e.status || 500;
    if (status === 500)
      console.error(
        JSON.stringify({
          request_id: requestId,
          code: "INTERNAL_ERROR",
          name: e.name,
        }),
      );
    return json(
      {
        error: {
          code: e.code || "INTERNAL_ERROR",
          message:
            status === 500 ? "服务暂时不可用，请保留草稿后重试" : e.message,
          details: e.details,
        },
        request_id: requestId,
      },
      status,
    );
  }
}
async function readBounded(req, max) {
  assert(
    Number(req.headers.get("content-length") || 0) <= max,
    "BODY_TOO_LARGE",
    "请求超过2 MB限制",
    413,
  );
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Fault(413, "BODY_TOO_LARGE", "请求超过2 MB限制");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(bytes);
}
function storedReply(data) {
  // Earlier versions persisted matching answers in unfinished session receipts.
  if (!["exam", "practice"].includes(data?.mode) || data.status === "completed" || !Array.isArray(data.items))
    return data;
  return {
    ...data,
    items: data.items.map((item) => {
      if (data.mode === "practice" && item.submitted_at || !item.snapshot?.answer_pairs)
        return item;
      const snapshot = { ...item.snapshot };
      delete snapshot.answer_pairs;
      return { ...item, snapshot };
    }),
  };
}

function requireDesktopExam(s, id, method, body) {
  if (!id && method === "POST") {
    assert(body.mode === "exam", "EXAM_ONLY", "绯月只接续正式考试", 403);
  } else if (id === "current") {
    const current = s.all("sessions").find((session) => session.status !== "completed");
    assert(
      !current || current.mode === "exam",
      "WEB_PRACTICE_OPEN",
      "请先在网页版完成当前练习",
      409,
    );
  } else if (id) {
    assert(s.get("sessions", id).mode === "exam", "EXAM_ONLY", "绯月只接续正式考试", 403);
  }
}

async function route(s, p, m, b, req, query, now, desktopExamOnly) {
  const [root, id, action] = p;
  const result = (data, status) => ({ data, status });
  if (root === "config" && m === "GET")
    return result({
      format_version: "1.0",
      limits: LIMITS,
      display_timezone: "Asia/Tokyo",
      auth_mode: s.owner === "local-user" ? "local" : "access",
    });
  if (root === "operations" && m === "GET") {
    const op = s.all("operations").find((o) => o.client_op_id === id);
    assert(op, "NOT_FOUND", "尚无成功回执", 404);
    return result(storedReply(op.response));
  }
  if (root === "banks") {
    if (!id && m === "GET")
      return result(
        page(
          s
            .all("banks")
            .map((x) => ({
              ...x,
              question_count: s
                .all("questions")
                .filter((q) => q.bank_id === x.id).length,
              active_count: s
                .all("questions")
                .filter((q) => q.bank_id === x.id && q.status === "active")
                .length,
            })),
          query,
        ),
      );
    if (!id && m === "POST") {
      fields(b, ["name", "description"]);
      str(b.name, "题库名", 100);
      str(b.description || "", "题库描述", 2000, true);
      return result(
        s.put("banks", entity({ ...b, status: "active" }, now)),
        201,
      );
    }
    const bank = s.get("banks", id);
    if (!action && m === "GET") return result(bank);
    if (!action && m === "PATCH") {
      edit(req, bank, b, ["name", "description", "status"], now);
      str(bank.name, "题库名", 100);
      str(bank.description || "", "描述", 2000, true);
      assert(
        ["active", "inactive"].includes(bank.status),
        "INVALID_STATUS",
        "题库状态无效",
      );
      return result(bank);
    }
    if (action === "questions") {
      if (m === "GET") {
        let qs = s.all("questions").filter((q) => q.bank_id === id);
        const status = query.get("status"),
          text = query.get("q")?.toLowerCase(),
          tagIds = query.getAll("tag_ids");
        if (status) qs = qs.filter((q) => q.status === status);
        if (text)
          qs = qs.filter((q) =>
            (q.title + " " + q.stem + " " + q.external_id)
              .toLowerCase()
              .includes(text),
          );
        if (tagIds.length)
          qs = qs.filter((q) =>
            query.get("tag_match") === "all"
              ? tagIds.every((t) => q.tag_ids.includes(t))
              : tagIds.some((t) => q.tag_ids.includes(t)),
          );
        const response = page(qs, query);
        if (desktopExamOnly) {
          const ids = new Set(response.items.map(q => q.id));
          const attempted = new Set(s.all("attempts").filter(a => ids.has(a.question_id)).map(a => a.question_id));
          response.items = response.items.map(q => ({ ...q, attempted: attempted.has(q.id) }));
        }
        return result(response);
      }
      if (m === "POST") {
        const q = validateQuestion(s, id, {
          ...b,
          external_id: b.external_id || uid(),
        });
        return result(updateQuestion(s, id, "manual", q, now), 201);
      }
    }
    if (action === "purge" && m === "POST") {
      matchRevision(req, bank);
      assert(
        !s.all("sessions").some((x) => x.bank_id === id && x.status !== "completed"),
        "ACTIVE_SESSION",
        "请先结束该题库所有进行中的会话再清空",
        409,
      );
      // Collect IDs to remove, ordered so dependents go first
      const qIds  = new Set(s.all("questions").filter((q) => q.bank_id === id).map((q) => q.id));
      const tIds  = new Set(s.all("tags").filter((t) => t.bank_id === id).map((t) => t.id));
      const aIds  = new Set(s.all("assets").filter((a) => a.bank_id === id).map((a) => a.id));
      const jIds  = new Set(s.all("import_jobs").filter((j) => j.bank_id === id).map((j) => j.id));
      const ejIds = new Set(s.all("export_jobs").filter((j) => j.bank_id === id).map((j) => j.id));
      // Dependents of questions
      for (const x of s.all("comments"))       if (qIds.has(x.question_id))   s.remove("comments",      x.id);
      for (const x of s.all("review_state"))   if (qIds.has(x.question_id))   s.remove("review_state",  x.id);
      for (const x of s.all("attempts"))       if (qIds.has(x.question_id) || x.bank_id === id) s.remove("attempts", x.id);
      for (const x of s.all("reflections")) {
        const si = s.data.session_items.get(x.session_item_id);
        if (si && qIds.has(si.question_id)) s.remove("reflections", x.id);
      }
      // Import rows
      for (const x of s.all("import_rows"))    if (jIds.has(x.job_id))        s.remove("import_rows",   x.id);
      // Root entities
      for (const qid of qIds)  s.remove("questions",   qid);
      for (const tid of tIds)  s.remove("tags",         tid);
      for (const aid of aIds)  s.remove("assets",       aid);
      for (const jid of jIds)  s.remove("import_jobs",  jid);
      for (const eid of ejIds) s.remove("export_jobs",  eid);
      // Bump bank revision so stale If-Match is caught on next edit
      bank.revision++;
      bank.updated_at = now;
      return result({
        deleted: {
          questions: qIds.size,
          tags: tIds.size,
          assets: aIds.size,
          import_jobs: jIds.size,
          export_jobs: ejIds.size,
        },
      });
    }
    if (action === "stats" && m === "GET")
      return result(stats(s, id, query, now));
    if (action === "review" && m === "GET") {
      let rows = s
        .all("review_state")
        .filter(
          (r) =>
            r.bank_id === id &&
            s.get("questions", r.question_id).status === "active",
        );
      if (query.get("state"))
        rows = rows.filter((r) => r.state === query.get("state"));
      return result(
        page(
          rows.map((r) => ({
            ...r,
            question: s.get("questions", r.question_id),
          })),
          query,
        ),
      );
    }
    if (action === "ai-kit" && m === "GET")
      return result({
        format_version: "1.0",
        bank_id: id,
        limits: LIMITS,
        tags: s.all("tags").filter((t) => !t.bank_id || t.bank_id === id),
        prompt: AI_PROMPT,
        question_template: {
          format_version: "1.0",
          bank_id: id,
          source_key: "your-source",
          images: [],
          questions: [
            {
              external_id: "Q001",
              title: "标题",
              type: "single",
              stem: "题干",
              options: [
                { id: "o1", text: "选项一" },
                { id: "o2", text: "选项二" },
              ],
              answer_option_ids: ["o1"],
              shuffle_policy: "shuffle",
              explanation: "[[option:o1]] 正确的原因",
              tag_ids: [],
              source: "",
              status: "active",
            },
          ],
        },
        tag_template: {
          format_version: "1.0",
          bank_id: id,
          tags: [
            {
              id: "root-example",
              scope: "knowledge",
              parent_id: null,
              name: "一级分类",
              description: "",
              status: "active",
            },
            {
              id: "child-example",
              scope: "knowledge",
              parent_id: "root-example",
              name: "知识点",
              description: "",
              status: "active",
            },
          ],
        },
        review_issues_template: {
          format_version: "1.0",
          bank_id: id,
          issues: [],
        },
      });
  }
  if (root === "questions") {
    const q = s.get("questions", id);
    if (!action && m === "GET") return result(q);
    if (!action && m === "PATCH") {
      matchRevision(req, q);
      fields(b, QUESTION_FIELDS);
      const payload = Object.fromEntries(
        QUESTION_FIELDS.map((k) => [k, b[k] ?? q[k]]),
      );
      validateQuestion(s, q.bank_id, payload, s.all("assets"), q.tag_ids);
      return result(
        updateQuestion(s, q.bank_id, q.source_key, payload, now, q),
      );
    }
    if (action === "status" && m === "POST") {
      matchRevision(req, q);
      fields(b, ["status", "reason"]);
      const payload = Object.fromEntries(
        QUESTION_FIELDS.map((k) => [k, k === "status" ? b.status : q[k]]),
      );
      validateQuestion(s, q.bank_id, payload, s.all("assets"), q.tag_ids);
      const updated = updateQuestion(
        s,
        q.bank_id,
        q.source_key,
        payload,
        now,
        q,
      );
      updated.status_reason = b.reason || "";
      return result(updated);
    }
    if (action === "comments") {
      if (m === "GET")
        return result(
          page(
            s.all("comments").filter((x) => x.question_id === id),
            query,
          ),
        );
      if (m === "POST") {
        fields(b, ["body"]);
        str(b.body, "评论", 20000);
        return result(
          s.put("comments", entity({ question_id: id, body: b.body }, now)),
          201,
        );
      }
    }
  }
  if (root === "tags") {
    if (!id && m === "GET")
      return result(
        page(
          s
            .all("tags")
            .filter(
              (t) =>
                (!query.get("bank_id") ||
                  !t.bank_id ||
                  t.bank_id === query.get("bank_id")) &&
                (!query.get("scope") || t.scope === query.get("scope")) &&
                (!query.get("status") || t.status === query.get("status")),
            ),
          query,
        ),
      );
    if (!id && m === "POST") {
      fields(b, [
        "id",
        "scope",
        "bank_id",
        "parent_id",
        "name",
        "description",
        "status",
      ]);
      const t = {
        ...entity(
          {
            scope: "knowledge",
            parent_id: null,
            status: "active",
            description: "",
            ...b,
          },
          now,
        ),
      };
      assert(!s.data.tags.has(t.id), "DUPLICATE_ID", "标签ID已存在");
      validateTag(s, t);
      return result(s.put("tags", t), 201);
    }
    const t = s.get("tags", id);
    if (m === "PATCH" && !action) {
      edit(req, t, b, ["name", "description", "status", "parent_id"], now);
      validateTag(s, t, t.id);
      if (t.status === "inactive")
        for (const c of s.all("tags").filter((c) => c.parent_id === id)) {
          c.status = "inactive";
          c.revision++;
        }
      return result(t);
    }
    if (action === "merge" && m === "POST") {
      matchRevision(req, t);
      fields(b, ["target_id"]);
      const target = s.get("tags", b.target_id);
      assert(
        target.id !== id &&
          target.scope === t.scope &&
          target.bank_id === t.bank_id &&
          Boolean(target.parent_id) === Boolean(t.parent_id) &&
          target.status === "active",
        "INVALID_MERGE",
        "只能合并同范围同层级标签到启用目标",
      );
      assert(
        !s.all("tags").some((c) => c.parent_id === id),
        "MERGE_CHILDREN_FIRST",
        "请先合并或移动源分类下的子标签",
      );
      let count = 0;
      for (const q of s.all("questions"))
        if (q.tag_ids.includes(id)) {
          q.tag_ids = [
            ...new Set(q.tag_ids.map((x) => (x === id ? target.id : x))),
          ];
          q.revision++;
          count++;
        }
      t.status = "inactive";
      t.revision++;
      s.put(
        "tag_aliases",
        entity(
          { old_tag_id: id, target_tag_id: target.id, merged_at: now },
          now,
        ),
      );
      return result({ migrated: count });
    }
  }
  if (root === "assets") {
    if (!id && m === "GET") return result(page(s.all("assets"), query));
    if (!id && m === "POST") {
      const { bank_id = null, ...data } = b;
      validateAsset(data);
      if (bank_id) s.get("banks", bank_id);
      assert(!s.data.assets.has(data.id), "DUPLICATE_ID", "资产ID已存在");
      return result(s.put("assets", entity({ ...data, bank_id }, now)), 201);
    }
    const a = s.get("assets", id);
    if (m === "GET" && !action) return result(a);
    if (m === "GET" && action === "references")
      return result({
        items: s
          .all("questions")
          .filter((q) => (q.stem + q.explanation).includes(`asset:${id}`))
          .map((q) => ({ id: q.id, title: q.title })),
        next_cursor: null,
      });
    if (m === "PATCH") {
      matchRevision(req, a);
      const candidate = { ...a, ...b };
      const data = Object.fromEntries(
        [
          "id",
          "provider",
          "url",
          "file_id",
          "object_key",
          "path",
          "sha256",
          "mime_type",
          "byte_size",
          "data_base64",
        ]
          .filter((k) => candidate[k] !== undefined)
          .map((k) => [k, candidate[k]]),
      );
      validateAsset(data);
      Object.assign(a, data, { revision: a.revision + 1 });
      return result(a);
    }
    if (m === "DELETE") {
      matchRevision(req, a);
      assert(
        !s
          .all("questions")
          .some((q) => (q.stem + q.explanation).includes(`asset:${id}`)) &&
          !s.all("reports").some((r) => r.attachment_asset_id === id),
        "ASSET_IN_USE",
        "资产仍被引用",
        409,
      );
      s.remove("assets", id);
      return result(null, 204);
    }
  }
  if (root === "imports" || root === "tag-imports") {
    if (!id && m === "POST")
      return result(
        previewImport(s, b, now, root === "tag-imports" ? "tags" : "questions"),
        201,
      );
    if (!id && m === "GET")
      return result(
        page(
          s.all("import_jobs").map((j) => ({ ...j, images: undefined })),
          query,
        ),
      );
    const job = s.get("import_jobs", id);
    if (m === "GET" && action === "rows")
      return result(
        page(
          s
            .all("import_rows")
            .filter(
              (r) =>
                r.job_id === id &&
                (!query.get("status") || r.status === query.get("status")),
            ),
          query,
        ),
      );
    if (m === "GET" && !action) return result(getJob(s, id));
    if (m === "POST" && ["commit", "advance", "retry"].includes(action))
      return result(
        advanceImport(s, job, b, now),
        job.cursor === job.total ? 200 : 202,
      );
  }
  if (root === "sessions") {
    if (id === "current" && m === "GET") {
      const current = s.all("sessions").find((x) => x.status !== "completed");
      return result(current ? sessionDTO(s, current, now) : null);
    }
    if (!id && m === "GET") {
      const list = s
        .all("sessions")
        .filter(
          (x) =>
            (!query.get("bank_id") || x.bank_id === query.get("bank_id")) &&
            (!query.get("mode") || x.mode === query.get("mode")),
        );
      return result(
        page(
          list.map((x) => summary(s, x, now)),
          query,
        ),
      );
    }
    if (!id && m === "POST") {
      fields(b, ["bank_id", "mode", "device_id", "instance_id", "filters"]);
      const ses = newSession(s, b, now);
      const dto = sessionDTO(s, ses, now);
      assert(
        JSON.stringify(itemsFor(s, ses.id)).length < 900000,
        "SESSION_TOO_LARGE",
        "该轮题目过大，请缩短正文或使用图片引用",
      );
      return result(dto, 201);
    }
    const ses = s.get("sessions", id);
    if (m === "GET" && (!action || action === "result")) {
      if (action === "result")
        assert(
          ses.status === "completed",
          "RESULT_LOCKED",
          "交卷后才能查看结果",
          409,
        );
      return result({
        ...sessionDTO(s, ses, now),
        reflections: s
          .all("reflections")
          .filter((r) =>
            itemsFor(s, id).some((i) => i.id === r.session_item_id),
          ),
      });
    }
    if (action === "reflections" && m === "POST") {
      assert(ses.status === "completed", "RESULT_LOCKED", "交卷后可复盘", 409);
      const item = s.get("session_items", b.item_id);
      assert(item.session_id === id, "WRONG_ITEM", "题目不属于会话");
      str(b.body, "复盘", 20000);
      return result(
        s.put(
          "reflections",
          entity({ session_item_id: item.id, body: b.body }, now),
        ),
        201,
      );
    }
    if ((m === "POST" || m === "PATCH") && action) {
      if (ses.status === "completed" && action === "finish")
        return result(sessionDTO(s, ses, now));
      command(s, ses, action, b, now);
      return result(sessionDTO(s, ses, now));
    }
  }
  if (root === "exports") {
    if (!id && m === "POST") {
      fields(b, ["session_id", "bank_id", "from", "to", "include_images"]);
      let bankId = b.bank_id;
      if (b.session_id) {
        const ses = s.get("sessions", b.session_id);
        assert(
          ses.status === "completed",
          "RESULT_LOCKED",
          "只能导出已结束会话",
          409,
        );
        bankId = ses.bank_id;
      }
      s.get("banks", bankId);
      return result(
        s.put(
          "export_jobs",
          entity(
            {
              bank_id: bankId,
              session_id: b.session_id || null,
              from: b.from || null,
              to: b.to || null,
              include_images: !!b.include_images,
              status: "pending",
              cursor: 0,
              missing_assets: [],
            },
            now,
          ),
        ),
        202,
      );
    }
    if (!id && m === "GET") return result(page(s.all("export_jobs"), query));
    const job = s.get("export_jobs", id);
    if (m === "POST" && ["advance", "retry"].includes(action)) {
      if (job.status === "pending") {
        const analysis = analysisData(s, job, now);
        assert(
          JSON.stringify(analysis).length < 1500000,
          "EXPORT_TOO_LARGE",
          "请缩小导出日期范围或按单场导出",
        );
        job.analysis = analysis;
        job.missing_assets = analysis.assets
          .filter((a) => !a.data_base64)
          .map((a) => ({
            id: a.id,
            reason: "外部资源未下载；保留定位信息，请手动补齐",
          }));
        job.status = job.missing_assets.length ? "incomplete" : "completed";
        job.cursor = analysis.items.length;
      }
      return result(job);
    }
    if (m === "GET") return result({ ...job, prompt: AI_PROMPT });
  }
  if (root === "reports") {
    if (!id && m === "GET")
      return result(
        page(
          s
            .all("reports")
            .filter(
              (x) =>
                !query.get("bank_id") || x.bank_id === query.get("bank_id"),
            ),
          query,
        ),
      );
    if (!id && m === "POST") {
      fields(b, [
        "export_id",
        "title",
        "body",
        "model_label",
        "attachment_asset_id",
      ]);
      const exp = s.get("export_jobs", b.export_id);
      str(b.title, "报告标题", 300);
      str(b.body || "", "报告", 100000, true);
      if (b.attachment_asset_id) s.get("assets", b.attachment_asset_id);
      return result(
        s.put("reports", entity({ ...b, bank_id: exp.bank_id }, now)),
        201,
      );
    }
    if (id && m === "GET") return result(s.get("reports", id));
  }
  if (["comments", "reflections", "reports"].includes(root) && id) {
    const d = s.get(root, id);
    if (m === "PATCH") {
      edit(
        req,
        d,
        b,
        root === "reports" ? ["title", "body", "model_label"] : ["body"],
        now,
      );
      str(d.body, "正文", root === "reports" ? 100000 : 20000, true);
      return result(d);
    }
    if (m === "DELETE") {
      matchRevision(req, d);
      s.remove(root, id);
      return result(null, 204);
    }
  }
  if (root === "backups") {
    if (m === "POST" && !id) {
      assert(
        !s.all("sessions").some((x) => x.status !== "completed"),
        "OPEN_SESSION",
        "备份前请结束当前会话",
        409,
      );
      const tables = Object.fromEntries(
        TABLES.filter(
          (t) => !["operations", "backup_jobs", "restore_jobs"].includes(t),
        ).map((t) => [t, s.all(t)]),
      );
      const content = { schema_version: 1, created_at: now, tables };
      assert(
        JSON.stringify(content).length < 1500000,
        "BACKUP_TOO_LARGE",
        "请使用本地SQLite备份或D1导出工具",
      );
      const job = entity(
        {
          status: "completed",
          content,
          sha256: await hash(JSON.stringify(content)),
        },
        now,
      );
      s.put("backup_jobs", job);
      return result(job, 201);
    }
    if (m === "GET" && id) return result(s.get("backup_jobs", id));
  }
  // Restore intentionally requires the offline validator; online replace is not exposed.
  throw new Fault(404, "NOT_FOUND", "接口不存在");
}
