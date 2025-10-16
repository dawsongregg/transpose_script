// server.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// GHL webhook for workflow #2 (creates the "other person")
const GHL_WEBHOOK_URL =
  process.env.GHL_WEBHOOK_URL ||
  "https://services.leadconnectorhq.com/hooks/9RO36OEQxzdIqkmWAwE1/webhook-trigger/c748beb7-f78b-4d00-9885-20bc41a62640";

/* ------------------------- helpers ------------------------- */

const first = (...vals) =>
  vals.find(v => v !== undefined && v !== null && String(v).trim() !== "") ?? "";

// pull safely from many possible locations / spellings
function normalize(src) {
  const cd = src.customData || src.customFields || {};
  const raw = src.raw || src; // handle GHL's raw body structure

  // identify who filled out the form
  const actor = (
    first(
      cd.student_parent_or_student,
      raw.student_parent_or_student,
      raw["Are you a parent or a student? "],
      cd.userType,
      raw.contactType
    ) || "Unknown"
  ).toString().trim();

  // sender (who filled out)
  const sender = {
    firstName: first(src.firstName, src.first_name, cd.first_name, raw.first_name),
    lastName:  first(src.lastName, src.last_name, cd.last_name, raw.last_name),
    email:     first(src.email, cd.email, raw.email),
    phone:     first(src.phone, cd.phone, raw.phone)
  };

  // student info — handle both webhook + survey naming
  const student = {
    firstName: first(
      cd.student_first_name,
      raw["Student's First Name"],
      raw["Student First Name"],
      raw.student_first_name
    ),
    lastName: first(
      cd.student_last_name,
      raw["Student's Last Name"],
      raw["Student Last Name"],
      raw.student_last_name
    ),
    email: first(
      cd.student_email,
      raw["Student's Email "],
      raw["Student Email"],
      raw.student_email
    ),
    phone: first(
      cd.student_phone,
      raw["Student's Phone Number"],
      raw["Student Phone Number"],
      raw.student_phone
    )
  };

  // parent info — handle both webhook + survey naming
  const parent = {
    firstName: first(
      cd.parent_first_name,
      raw["Parent First Name"],
      raw.parent_first_name
    ),
    lastName: first(
      cd.parent_last_name,
      raw["Parent Last Name"],
      raw.parent_last_name
    ),
    email: first(
      cd.parent_email,
      raw["Parent Email Address "],
      raw["Parent Email"],
      raw.parent_email
    ),
    phone: first(
      cd.parent_phone,
      raw["Parent Phone Number"],
      raw.parent_phone
    )
  };

  const tags = first(src.tags, cd.tags, raw.tags, src.tagList);

  return { actor, sender, student, parent, tags, raw: src };
}

function buildPayloadForStudent(counterparts, meta) {
  // Create STUDENT contact; stash PARENT in customData
  const { student, parent, tags } = counterparts;
  return {
    first_name: student.firstName,
    last_name:  student.lastName,
    phone:      student.phone,
    email:      student.email,
    tags:       tags,
    contact_type: "lead",
    customData: {
      parent_first_name: parent.firstName,
      parent_last_name:  parent.lastName,
      parent_phone:      parent.phone,
      parent_email:      parent.email,
      student_parent_or_student: "Student"
    },
    meta: {
      source: meta?.source || "transpose",
      received_at: new Date().toISOString()
    }
  };
}

function buildPayloadForParent(counterparts, meta) {
  // Create PARENT contact; stash STUDENT in customData
  const { parent, student, tags } = counterparts;
  return {
    first_name: parent.firstName,
    last_name:  parent.lastName,
    phone:      parent.phone,
    email:      parent.email,
    tags:       tags,
    contact_type: "lead",
    customData: {
      student_first_name: student.firstName,
      student_last_name:  student.lastName,
      student_phone:      student.phone,
      student_email:      student.email,
      student_parent_or_student: "Parent"
    },
    meta: {
      source: meta?.source || "transpose",
      received_at: new Date().toISOString()
    }
  };
}

/* ------------------------- route ------------------------- */

app.post("/webhook", async (req, res) => {
  try {
    const norm = normalize(req.body);
    console.log("↘︎ Incoming (normalized):", JSON.stringify(norm, null, 2));

    let outbound;
    if (/^parent$/i.test(norm.actor)) {
      outbound = buildPayloadForStudent(norm, { source: "parent->student" });
    } else if (/^student$/i.test(norm.actor)) {
      outbound = buildPayloadForParent(norm, { source: "student->parent" });
    } else {
      console.warn("⚠️ Unknown actor; echoing payload to help debugging.");
      outbound = { ...req.body, meta: { note: "unknown-actor", received_at: new Date().toISOString() } };
    }

    // minimal sanity check so we don’t create empty contacts
    const hasCore =
      first(outbound.first_name) && (first(outbound.email) || first(outbound.phone));
    if (!hasCore) {
      console.warn("⚠️ Missing core fields for new contact; skipping send.", outbound);
      return res.status(202).json({ skipped: true, reason: "missing core fields", preview: outbound });
    }

    console.log("↗︎ Sending to GHL:", JSON.stringify(outbound, null, 2));
    await axios.post(GHL_WEBHOOK_URL, outbound, { headers: { "Content-Type": "application/json" } });

    res.status(200).json({ ok: true });
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
