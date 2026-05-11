const followingInput = document.getElementById("followingInput");
const followersInput = document.getElementById("followersInput");

const followingCount = document.getElementById("followingCount");
const followersCount = document.getElementById("followersCount");
const resultCount = document.getElementById("resultCount");
const resultList = document.getElementById("resultList");

const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");
const swapBtn = document.getElementById("swapBtn");

function normalizeName(value) {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseList(text) {
  const raw = text
    .split(/\n|,|;|\t/)
    .map(normalizeName)
    .filter(Boolean)
    .filter(name => /^[a-z0-9._]+$/.test(name));

  return [...new Set(raw)];
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function update() {
  autoResize(followingInput);
  autoResize(followersInput);

  const following = parseList(followingInput.value);
  const followers = parseList(followersInput.value);
  const followerSet = new Set(followers);

  const notFollowingBack = following.filter(name => !followerSet.has(name));

  followingCount.textContent = `${following.length} nöfn`;
  followersCount.textContent = `${followers.length} nöfn`;
  resultCount.textContent = notFollowingBack.length;

  if (!following.length && !followers.length) {
    resultList.textContent = "Engin gögn komin inn.";
    resultList.classList.add("empty");
    return;
  }

  if (!notFollowingBack.length) {
    resultList.textContent = "Allir sem þú followar virðast followa þig tilbaka.";
    resultList.classList.add("empty");
    return;
  }

  resultList.textContent = notFollowingBack.map(name => `@${name}`).join("\n");
  resultList.classList.remove("empty");
}

function getResultText() {
  return resultList.classList.contains("empty") ? "" : resultList.textContent;
}

followingInput.addEventListener("input", update);
followersInput.addEventListener("input", update);

copyBtn.addEventListener("click", async () => {
  const text = getResultText();
  if (!text) return;

  await navigator.clipboard.writeText(text);
  copyBtn.textContent = "Copied";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
});

downloadBtn.addEventListener("click", () => {
  const text = getResultText();
  if (!text) return;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "not-following-back.txt";
  a.click();

  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", () => {
  followingInput.value = "";
  followersInput.value = "";
  update();
});

swapBtn.addEventListener("click", () => {
  const temp = followingInput.value;
  followingInput.value = followersInput.value;
  followersInput.value = temp;
  update();
});

update();