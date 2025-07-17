// script.js (v15 - Admin Experience & Silent Login)

// 模块导入
import { hash, compare } from "https://esm.sh/bcrypt-ts@5.0.2";

// --- DOM 元素获取 ---
// ... (这部分不变) ...
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
let hasEditPermission = false;
let isAdmin = false;
let tableData = [];
const tableHeaders = ["选手", "成绩", "视频", "最近更改时间", "操作"];
let editingAsUser = null; // 【新增】用于 Admin 模式，暂存正在编辑的用户名

// --- 登录/注册处理 ---
async function handleLogin(username, password) {
  currentUser = username;

  if (!password) {
    hasEditPermission = false;
    isAdmin = false;
    sessionStorage.setItem("sessionData", JSON.stringify({ username: "访客", hasEditPermission: false }));
    showApp("访客");
    return;
  }

  try {
    const { data: profile } = await supabaseClient.from("profiles").select("encrypted_password").eq("username", username).single();

    if (profile) {
      const passwordMatch = await compare(password, profile.encrypted_password);
      hasEditPermission = passwordMatch;
      // 【需求1 实现】: 不再弹出密码错误的提示，实现静默登录
      // if (!passwordMatch) {
      //     alert("密码错误！您将以只读模式登录。");
      // }
    } else {
      const hashedPassword = await hash(password, 10);
      await supabaseClient.from("profiles").insert({ username, encrypted_password: hashedPassword });
      hasEditPermission = true;
    }

    isAdmin = username.toLowerCase() === "admin" && hasEditPermission;
    sessionStorage.setItem("sessionData", JSON.stringify({ username, hasEditPermission }));
    showApp(username);
  } catch (error) {
    // 简化错误处理，因为之前的版本已经很健壮了
    alert(`登录处理失败: ${error.message}`);
    loginButton.disabled = false;
    loginButton.textContent = "进入";
  }
}

function showApp(name) {
  currentUser = name;
  editingAsUser = null; // 重置编辑状态

  let statusText = "未知";
  if (name === "访客") {
    statusText = "访客";
  } else if (hasEditPermission) {
    statusText = isAdmin ? "管理员" : "编辑者";
  } else {
    statusText = "只读";
  }
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

  // 【需求2 实现】: Admin不显示添加行，只有普通编辑者才显示
  if (hasEditPermission && !isAdmin) {
    const formRow = document.createElement("tr");
    formRow.id = "form-row";
    const displayName = editingAsUser || currentUser; // 优先显示正在编辑的用户名
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
    // 【新增】将创建者用户名也存入 dataset，方便读取
    dataRow.dataset.creator = rowData.creator_username;

    const formattedTime = new Date(rowData.updated_at)
      .toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .replace(/\//g, "-");

    const canModify = isAdmin || currentUser === rowData.creator_username;
    const actionButtons =
      canModify && hasEditPermission ? `<button class="action-btn edit">修改</button> <button class="action-btn delete">删除</button>` : "仅查看";

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

// --- 数据操作 (使用 RPC) ---

async function handleSubmit() {
  if (!hasEditPermission) {
    alert("无修改权限！");
    return;
  }

  const scoreInput = document.getElementById("score-input");
  const videoInput = document.getElementById("video-input");
  const editingIdInput = document.getElementById("editing-id-input");

  // 【需求2 实现】: 确定数据的真正“选手”
  const actualPlayer = editingAsUser || currentUser;

  const entryData = {
    "选手": actualPlayer,
    "成绩": scoreInput.value.trim() || "无",
    "视频": videoInput.value.trim() || "无",
  };

  const currentId = editingIdInput.value;

  try {
    let response;
    if (currentId) {
      // 调用更新函数, updater_name 永远是当前登录者 (currentUser)，用于权限判断
      response = await supabaseClient.rpc("update_score", {
        record_id: Number(currentId),
        updater_name: currentUser,
        score_data: entryData,
      });
    } else {
      // 调用插入函数
      response = await supabaseClient.rpc("insert_score", {
        creator_name: actualPlayer,
        score_data: entryData,
      });
    }

    const { error } = response;
    if (error) throw error;

    // 操作成功后，重置编辑状态并刷新
    editingAsUser = null;
    editingIdInput.value = "";
    scoreInput.value = "";
    videoInput.value = "";
    document.getElementById("submit-button").textContent = "上传";
    await loadTableData();
  } catch (error) {
    alert(`操作失败: ${error.message}`);
  }
}

async function handleDelete(id) {
  if (!hasEditPermission) {
    alert("无修改权限！");
    return;
  }

  if (confirm("确定要删除这条数据吗？")) {
    try {
      // deleter_name 永远是当前登录者 (currentUser)，用于权限判断
      const { error } = await supabaseClient.rpc("delete_score", {
        record_id: Number(id),
        deleter_name: currentUser,
      });

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

// 表格事件委托
tableBody.addEventListener("click", e => {
  const target = e.target;
  if (target.id === "submit-button") {
    handleSubmit();
    return;
  }

  const row = target.closest("tr");
  if (!row || !row.dataset.id) return;

  if (target.classList.contains("edit")) {
    if (!hasEditPermission) {
      alert("无修改权限！");
      return;
    }

    // 【需求2 实现】Admin 点击修改的特殊逻辑
    if (isAdmin) {
      // 如果 Admin 的添加行不存在，动态创建一个
      if (!document.getElementById("form-row")) {
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

      // 暂存正在编辑的用户名
      editingAsUser = row.dataset.creator;
      document.getElementById("form-player-name").textContent = escapeHTML(editingAsUser);
    } else {
      // 非 Admin 用户编辑自己时，清空暂存状态
      editingAsUser = null;
    }

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
  hasEditPermission = session.hasEditPermission;
  isAdmin = hasEditPermission && currentUser.toLowerCase() === "admin";
  showApp(currentUser);
} else {
  loginModal.classList.remove("hidden");
}
