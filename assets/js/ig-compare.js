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

const STORAGE_KEYS = {
  following: "igCompare.following",
  followers: "igCompare.followers",
};

function normalizeName(value) {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/[^\p{L}\p{N}._]/gu, "")
    .toLowerCase();
}

function looksLikeUsername(name) {
  if (!name) return false;
  if (name === ".") return false;
  if (name.length < 2) return false;
  if (name.includes(" ")) return false;

  if (!/^[a-z0-9._]+$/.test(name)) return false;
  if (/^[._]+$/.test(name)) return false;

  return true;
}

function parseList(text) {
  const raw = text
    .split(/\r?\n|,|;|\t/)
    .map(normalizeName)
    .filter(looksLikeUsername);

  return [...new Set(raw)];
}

function autoResize() {
  // Intentionally disabled.
  // Textareas should stay compact and scroll internally.
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.following, followingInput.value);
  localStorage.setItem(STORAGE_KEYS.followers, followersInput.value);
}

function loadState() {
  followingInput.value = localStorage.getItem(STORAGE_KEYS.following) || "";
  followersInput.value = localStorage.getItem(STORAGE_KEYS.followers) || "";
}

function update() {
  autoResize();

  const following = parseList(followingInput.value);
  const followers = parseList(followersInput.value);
  const followerSet = new Set(followers);

  const notFollowingBack = following.filter(
    name => !followerSet.has(name)
  );

  followingCount.textContent = `${following.length} nöfn`;
  followersCount.textContent = `${followers.length} nöfn`;
  resultCount.textContent = notFollowingBack.length;

  if (!following.length && !followers.length) {
    resultList.textContent = "Engin gögn komin inn.";
    resultList.classList.add("empty");
    return;
  }

  if (!notFollowingBack.length) {
    resultList.textContent =
      "Allir sem þú followar virðast followa þig tilbaka.";
    resultList.classList.add("empty");
    return;
  }

  resultList.textContent = notFollowingBack
    .map(name => `@${name}`)
    .join("\n");

  resultList.classList.remove("empty");
}

function getResultText() {
  return resultList.classList.contains("empty")
    ? ""
    : resultList.textContent;
}

followingInput.addEventListener("input", () => {
  saveState();
  update();
});

followersInput.addEventListener("input", () => {
  saveState();
  update();
});

copyBtn.addEventListener("click", async () => {
  const text = getResultText();
  if (!text) return;

  await navigator.clipboard.writeText(text);

  copyBtn.textContent = "Copied";
  setTimeout(() => {
    copyBtn.textContent = "Copy";
  }, 1200);
});

downloadBtn.addEventListener("click", () => {
  const text = getResultText();
  if (!text) return;

  const blob = new Blob([text], {
    type: "text/plain;charset=utf-8",
  });

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

  localStorage.removeItem(STORAGE_KEYS.following);
  localStorage.removeItem(STORAGE_KEYS.followers);

  update();
});

swapBtn.addEventListener("click", () => {
  const temp = followingInput.value;

  followingInput.value = followersInput.value;
  followersInput.value = temp;

  saveState();
  update();
});

loadState();
update();