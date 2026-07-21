"use strict";

const progress = document.querySelector("#progress");
const card = document.querySelector("#rating-card");
const candidateId = document.querySelector("#candidate-id");
const image = document.querySelector("#candidate-image");
const form = document.querySelector("#rating-form");
const complete = document.querySelector("#complete");
const download = document.querySelector("#download");
const error = document.querySelector("#error");

let session = null;
let index = 0;
const ratings = [];

function showCandidate() {
  const candidate = session.candidates[index];
  if (!candidate) {
    card.hidden = true;
    complete.hidden = false;
    progress.textContent = `${ratings.length} of ${session.candidates.length} rated`;
    return;
  }
  progress.textContent = `${index + 1} of ${session.candidates.length}`;
  candidateId.textContent = candidate.blindedId;
  image.src = candidate.image;
  card.hidden = false;
  form.reset();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const candidate = session.candidates[index];
  const values = new FormData(form);
  ratings.push({
    blindedId: candidate.blindedId,
    explicitDetailCoverage: Number(values.get("explicitDetailCoverage")),
    unsupportedConcreteness: Number(values.get("unsupportedConcreteness")),
    pencilCompliance: Number(values.get("pencilCompliance")),
    notes: String(values.get("notes") || "")
  });
  index += 1;
  showCandidate();
});

download.addEventListener("click", () => {
  const payload = JSON.stringify({
    schemaVersion: 1,
    sourceRunId: session.sourceRunId,
    syntheticOnly: true,
    ratings
  }, null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  link.download = `${session.sourceRunId}-ratings.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

fetch("./session/session.json")
  .then((response) => {
    if (!response.ok) throw new Error("Prepare a rating session before opening this tool.");
    return response.json();
  })
  .then((value) => {
    session = value;
    showCandidate();
  })
  .catch((reason) => {
    progress.textContent = "No session loaded.";
    error.textContent = reason instanceof Error ? reason.message : String(reason);
  });
