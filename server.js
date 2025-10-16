// server.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// GHL webhook for workflow #4 (Inbounding Transpose)
const GHL_WEBHOOK_URL =
  process.env.GHL_WEBHOOK_URL ||
  "https://services.leadconnectorhq.com/hooks/9RO36OEQxzdIqkmWAwE1/webhook-trigger/c748beb7-f78b-4d00-9885-20bc41a62640";

/* ------------------------- helpers ------------------------- */

const first = (...vals) =>
  vals.find(v => v !== undefined && v !== null && String(v).trim() !== "") ?? "";

// Normalize incoming GHL body to a clean, predictable format
function normalize(src) {
  const cd = src.customData || src.customFields || {};
  const raw = src.raw || src;

  const actor = (
    first(
      cd.student_parent_or_student,
      raw.student_parent_or_student,
      raw["Are you a parent or a student? "],
      cd.userType,
      raw.contactType
    ) || "Unknown"
  ).toString().trim();

  const sender = {
    firstName: first(src.firstName, src.first_name, cd.first_name, raw.first_name),
    lastName:  first(src.lastName, src.last_name, cd.last_name, raw.last_name),
    email:     first(src.email, cd.email, raw.email),
    phone:     first(src.phone, cd.phone, raw.phone)
  };

  const student = {
    firstName: first(cd.student_first_name, raw["Student's First Name"], raw["Student First Name"], raw.student_first_name),
    lastName:  first(cd.student_last_name, raw["Student's Last Name"], raw["Student Last Name"], raw.student_last_name),
    email:     first(cd.student_email, raw["Student's Email "], raw["Student Email"], raw.student_email),
    phone:     first(cd.student_phone, raw["Student's Phone Number"], raw["Student Phone Number"], raw.student_phone)
  };

  const parent = {
    firstName: first(cd.parent_first_name, raw["Parent First Name"], raw.parent_first_name),
    lastName:  first(cd.parent_last_name, raw["Parent Last Name"], raw.parent_last_name),
    email:     first(cd.parent_email, raw["Parent Email Address "], raw["Parent Email"], raw.parent_email),
    phone:     first(cd.parent_phone, raw["Parent Phone Number"], raw.parent_phone)
  };

  const tags = first(src.tags, cd.tags, raw.tags, src.tagList);

  return { actor, sender, student, parent, tags, raw: src };
}

/* ------------------------- payload builders ------------------------- */

function buildPayloadForStudent(counterparts) {
  const { student, parent, tags } = counterparts;
  return {
    first_name: student.firstName,
    last_name:  student.lastName,
    phone:      student.phone,
    email:      student.email,
    tags,
    contact_type: "lead",
    customData: {
      parent_first_name: parent.firstName,
      parent_last_name:  parent.lastName,
      parent_phone:      parent.phone,
      parent_email:      parent.email,
      student_parent_or_student: "Student"
    }
  };
}

function buildPayloadForParent(counterparts) {
  const { parent, student, tags } = counterparts;
  return {
    first_name: parent.firstName,
    last_name:  parent.lastName,
    phone:      parent.phone,
    email:      parent.email,
    tags,
    contact_type: "lead",
    customData: {
      student_first_name: student.firstName,
      student_last_name:  student.lastName,
      student_phone:      student.phone,
      student_email:      student.email,
      student_parent_or_student: "Parent"
    }
  };
}

/* ------------------------- main route ------------------------- */

app.post("/webhook", async (req, res) => {
  try {
    const norm = normalize(req.body);
    console.log("↘︎ Incoming (normalized):", JSON.stringify(norm, null, 2));

    let outbound;
    if (/^parent$/i.test(norm.actor)) {
      outbound = buildPayloadForStudent(norm);
    } else if (/^student$/i.test(norm.actor)) {
      outbound = buildPayloadForParent(norm);
    } else {
      console.warn("⚠️ Unknown actor; skipping send.");
      return res.status(400).json({ ok: false, reason: "unknown actor" });
    }

    // Skip empty contacts
    const hasCore = first(outbound.first_name) && (first(outbound.email) || first(outbound.phone));
    if (!hasCore) {
      console.warn("⚠️ Missing core fields, skipping send:", outbound);
      return res.status(202).json({ skipped: true, reason: "missing core fields" });
    }

    // ✅ Flatten payload to avoid GHL rejection
    const safePayload = {
      first_name: outbound.first_name,
      last_name: outbound.last_name,
      email: outbound.email,
      phone: outbound.phone,
      tags: outbound.tags,
      contact_type: outbound.contact_type,
      customData: outbound.customData
    };

    console.log("↗︎ Sending to GHL:", JSON.stringify(safePayload, null, 2));
    const resp = await axios.post(GHL_WEBHOOK_URL, safePayload, {
      headers: { "Content-Type": "application/json" }
    });
    console.log("✅ GHL responded with:", resp.status, resp.data);

    res.status(200).json({ ok: true, sent: safePayload });
  } catch (err) {
    console.error("❌ transpose error:", err?.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------- boot ------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server on :${PORT}`);
  console.log(`POST ${process.env.RENDER_EXTERNAL_URL || "http://localhost:" + PORT}/webhook`);
});
