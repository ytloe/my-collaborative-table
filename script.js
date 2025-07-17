// 模块导入
import { hash, compare } from "https://esm.sh/bcrypt-ts@5.0.2";

// --- DOM 元素获取 ---
const loginModal = document.getElementById("login-modal");
const loginForm = document.getElementById("login-form");
const loginNameInput = document.getElementById("login-name");
const loginPasswordInput = document.getElementById("login-password");
const loginButton = document.getElementById("login-button");
const appContainer = document.getElementById("app-container");
const logoutButton = document.getElementById("logout-button");
const tableHead = document.getElementById("table-head");
const tableBody = document.getElementById("table-body");
const usernameDisplay = document.getElementById("username-display");

// --- Supabase 配置 ---
const SUPABASE_URL = "https://uccwwlrxufwzljhxyiyu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjY3d3bHJ4dWZ3emxqaHh5aXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTcxMzgsImV4cCI6MjA2ODI5MzEzOH0.aNFS1Q1kxLo_BEJzlDjLQy2uQrK1K9AOPqbMDlvrTBA";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 应用状态变量 ---
let currentUser = null;
let currentPassword = null;
let isVisitor = false;
let isAdmin = false;
let tableData = [];
const tableHeaders = ["选手", "成绩", "视频", "最近更改时间", "操作"];
let editingAsUser = null;

// --- 登录/注册处理 ---
async function handleLogin(username, password) {
  currentUser = username;
  currentPassword = password;

  if (!password) {
    currentUser = "访客";
    isVisitor = true;
    sessionStorage.setItem("sessionData", JSON.stringify({ username: "访客", password: "" }));
    showApp();
    return;
  }

  isVisitor = false;
  isAdmin = username.toLowerCase() === "admin";

  try {
    const { data: profile } = await supabaseClient.from("profiles").select("username").eq("username", username).single();

    if (!profile) {
      const hashedPassword = await hash(password, 10);
      await supabaseClient.from("profiles").insert({ username, encrypted_password: hashedPassword });
    }

    sessionStorage.setItem("sessionData", JSON.stringify({ username, password }));
    showApp();
  } catch (error) {
    alert(`登录处理失败: ${error.message}`);
    loginButton.disabled = false;
    loginButton.textContent = "进入";
  }
}

function showApp() {
  editingAsUser = null;
  let statusText = isVisitor ? "访客" : isAdmin ? "管理员" : "用户";
  usernameDisplay.textContent = `欢迎, ${currentUser} (${statusText})`;
  loginModal.classList.add("hidden");
  appContainer.classList.remove("hidden");
  loadTableData();
}

function logout() {
  sessionStorage.clear();
  window.location.reload();
}

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "进入中...";
  const u = loginNameInput.value.trim();
  const p = loginPasswordInput.value.trim();
  await handleLogin(u || "访客", p);
});

logoutButton.addEventListener("click", logout);

// --- 界面渲染 ---
function renderTable() {
  tableHead.innerHTML = `<tr><th>${tableHeaders.join("</th><th>")}</th></tr>`;
  tableBody.innerHTML = "";

  if (!isVisitor && !isAdmin) {
    const formRow = document.createElement("tr");
    formRow.id = "form-row";
    const displayName = editingAsUser || currentUser;
    formRow.innerHTML = `
            <td><span class="player-name" id="form-player-name">${escapeHTML(displayName)}</span></td>
            <td><input type="text" id="score-input" placeholder="输入成绩"></td>
            <td><input type="text" id="video-input" placeholder="输入视频链接/BV号"></td>
            <td><span class="placeholder-text">自动</span></td>
            <td class="actions">
                <button id="submit-button">上传</button>
                <input type="hidden" id="editing-id-input">
            </td>
        `;
    tableBody.appendChild(formRow);
  }

  tableData.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  tableData.forEach(rowData => {
    const dataRow = document.createElement("tr");
    dataRow.dataset.id = rowData.id;
    dataRow.dataset.creator = rowData.creator_username;

    const formattedTime = new Date(rowData.updated_at)
      .toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .replace(/\//g, "-");

    const canModify = isAdmin || currentUser === rowData.creator_username;
    const actionButtons =
      canModify && !isVisitor ? `<button class="action-btn edit">修改</button> <button class="action-btn delete">删除</button>` : "仅查看";

    dataRow.innerHTML = `
            <td>${escapeHTML(rowData.data["选手"] || "")}</td>
            <td>${escapeHTML(rowData.data["成绩"] || "")}</td>
            <td>${escapeHTML(rowData.data["视频"] || "")}</td>
            <td>${escapeHTML(formattedTime)}</td>
            <td class="actions">${actionButtons}</td>
        `;
    tableBody.appendChild(dataRow);
  });
}

// --- 数据操作 ---

// 核心验证函数
async function verifyPassword(usernameToVerify) {
  if (isVisitor || !currentPassword) {
    alert("访客无修改权限！");
    return false;
  }

  try {
    const { data: profile, error } = await supabaseClient.from("profiles").select("encrypted_password").eq("username", usernameToVerify).single();

    if (error || !profile) {
      alert(`错误：找不到用户 "${usernameToVerify}" 的验证信息。`);
      return false;
    }

    const passwordMatch = await compare(currentPassword, profile.encrypted_password);
    if (!passwordMatch) {
      alert("用户密码错误，无修改权限！");
      return false;
    }
    return true;
  } catch (e) {
    alert(`密码验证时发生错误: ${e.message}`);
    return false;
  }
}

async function handleSubmit() {
  const scoreInput = document.getElementById("score-input");
  const videoInput = document.getElementById("video-input");
  const editingIdInput = document.getElementById("editing-id-input");

  if (!scoreInput || !videoInput || !editingIdInput) return;

  const currentId = editingIdInput.value;
  const perpetrator = currentUser;
  const actualPlayer = editingAsUser || currentUser;

  // 在“上传”或“更新”时验证密码
  const isAuthorized = await verifyPassword(perpetrator);
  if (!isAuthorized) return;

  const entryData = {
    "选手": actualPlayer,
    "成绩": scoreInput.value.trim() || "无",
    "视频": videoInput.value.trim() || "无",
  };

  try {
    let response;
    if (currentId) {
      response = await supabaseClient.rpc("update_score", { record_id: Number(currentId), updater_name: perpetrator, score_data: entryData });
    } else {
      response = await supabaseClient.rpc("insert_score", { creator_name: actualPlayer, score_data: entryData });
    }
    const { error } = response;
    if (error) throw error;

    editingAsUser = null;
    editingIdInput.value = "";
    scoreInput.value = "";
    videoInput.value = "";
    document.getElementById("submit-button").textContent = "上传";
    if (isAdmin) document.getElementById("form-row")?.remove();

    await loadTableData();
  } catch (error) {
    alert(`操作失败: ${error.message}`);
  }
}

async function handleDelete(id) {
  const isAuthorized = await verifyPassword(currentUser);
  if (!isAuthorized) return;

  if (confirm("确定要删除这条数据吗？")) {
    try {
      const { error } = await supabaseClient.rpc("delete_score", { record_id: Number(id), deleter_name: currentUser });
      if (error) throw error;
      await loadTableData();
    } catch (error) {
      alert(`删除出错: ${error.message}`);
    }
  }
}

async function loadTableData() {
  try {
    const { data, error } = await supabaseClient.from("scores").select("*");
    if (error) throw error;
    tableData = data;
    renderTable();
  } catch (error) {
    alert(`加载数据失败: ${error.message}`);
  }
}

// 表格事件委托 (已更新)
tableBody.addEventListener("click", async e => {
  // <<<--- 标记为 async
  const target = e.target;
  const submitButton = document.getElementById("submit-button");
  if (submitButton && target.id === "submit-button") {
    handleSubmit();
    return;
  }

  const row = target.closest("tr");
  if (!row || !row.dataset.id) return;

  if (target.classList.contains("edit")) {
    // 【需求实现】: 点击"修改"时，立即验证密码
    const isAuthorized = await verifyPassword(currentUser);
    if (!isAuthorized) {
      return; // 验证失败，函数终止，不会显示编辑表单
    }

    // --- 验证通过后，才执行以下逻辑 ---

    if (isAdmin && !document.getElementById("form-row")) {
      const formRowHTML = `
                <tr id="form-row">
                    <td><span class="player-name" id="form-player-name"></span></td>
                    <td><input type="text" id="score-input" placeholder="输入成绩"></td>
                    <td><input type="text" id="video-input" placeholder="输入视频链接/BV号"></td>
                    <td><span class="placeholder-text">自动</span></td>
                    <td class="actions">
                        <button id="submit-button">更新</button>
                        <input type="hidden" id="editing-id-input">
                    </td>
                </tr>`;
      tableBody.insertAdjacentHTML("afterbegin", formRowHTML);
    }

    editingAsUser = row.dataset.creator;
    document.getElementById("form-player-name").textContent = escapeHTML(editingAsUser);

    const rowToEdit = tableData.find(d => d.id == row.dataset.id);
    if (rowToEdit) {
      document.getElementById("score-input").value = rowToEdit.data["成绩"] || "";
      document.getElementById("video-input").value = rowToEdit.data["视频"] || "";
      document.getElementById("editing-id-input").value = rowToEdit.id;
      document.getElementById("submit-button").textContent = "更新";
      window.scrollTo(0, 0);
    }
  } else if (target.classList.contains("delete")) {
    handleDelete(row.dataset.id);
  }
});

// --- 初始化 ---
function escapeHTML(str) {
  if (typeof str !== "string") return "";
  const p = document.createElement("p");
  p.textContent = str;
  return p.innerHTML;
}

const savedSession = sessionStorage.getItem("sessionData");
if (savedSession) {
  const session = JSON.parse(savedSession);
  currentUser = session.username;
  currentPassword = session.password;
  isVisitor = !currentPassword;
  isAdmin = !isVisitor && currentUser.toLowerCase() === "admin";
  showApp();
} else {
  loginModal.classList.remove("hidden");
}
