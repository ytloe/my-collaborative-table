// script.js (v12 - Single Client Instance Fix)

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
const SUPABASE_URL = "https://uccwwlrxufwzljhxyiyu.supabase.co"; // 你的 URL
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjY3d3bHJ4dWZ3emxqaHh5aXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTcxMzgsImV4cCI6MjA2ODI5MzEzOH0.aNFS1Q1kxLo_BEJzlDjLQy2uQrK1K9AOPqbMDlvrTBA"; // 你的 Anon Key

// 【关键修复】只声明一次，但用 let 允许重新赋值
let supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 应用状态变量 ---
let currentUser = null;
let hasEditPermission = false;
let isAdmin = false;
let tableData = [];
const tableHeaders = ["选手", "成绩", "视频", "最近更改时间", "操作"];

// 【关键修复】一个函数，用于根据登录状态重新配置唯一的客户端实例
function setupSupabaseClient(username) {
  if (username && username !== "访客" && hasEditPermission) {
    const encodedUsername = encodeURIComponent(username);
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { "x-username": encodedUsername },
      },
    });
    console.log(`Supabase client reconfigured for user: ${username}`);
  } else {
    // 访客或只读用户，使用无特殊请求头的默认客户端
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client set to default for visitor/read-only mode.");
  }
}

// --- 登录/注册处理 ---
async function handleLogin(username, password) {
  currentUser = username;

  // 如果没有密码，则为访客
  if (!password) {
    hasEditPermission = false;
    isAdmin = false;
    sessionStorage.setItem("sessionData", JSON.stringify({ username: "访客", hasEditPermission: false }));
    showApp("访客");
    return;
  }

  try {
    // 使用默认客户端进行初始查询，因为它不需要特殊头
    const { data: profile, error: selectError } = await window.supabase
      .createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      .from("profiles")
      .select("encrypted_password")
      .eq("username", username)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      throw new Error(`查询用户信息时出错: ${selectError.message}`);
    }

    if (profile) {
      // 用户存在，验证密码
      const passwordMatch = await compare(password, profile.encrypted_password);
      hasEditPermission = passwordMatch;
      if (!passwordMatch) {
        alert("密码错误！您将以只读模式登录。");
      }
    } else {
      // 用户不存在，静默注册
      console.log(`User "${username}" not found. Registering silently.`);
      const hashedPassword = await hash(password, 10);
      const { error: insertError } = await supabaseClient.from("profiles").insert({ username, encrypted_password: hashedPassword });

      if (insertError) {
        if (insertError.code === "23505") throw new Error(`注册失败，用户名 "${username}" 已被占用。`);
        throw insertError;
      }
      hasEditPermission = true;
    }

    isAdmin = username.toLowerCase() === "admin" && hasEditPermission;
    sessionStorage.setItem("sessionData", JSON.stringify({ username, hasEditPermission }));
    showApp(username);
  } catch (error) {
    alert(`登录处理失败: ${error.message}`);
    loginButton.disabled = false;
    loginButton.textContent = "进入";
  }
}

function showApp(name) {
  currentUser = name;

  // 根据最终的权限状态，配置全局客户端
  setupSupabaseClient(currentUser);

  let statusText;
  if (name === "访客" || !hasEditPermission) {
    statusText = hasEditPermission ? "用户" : name === "访客" ? "访客" : "只读";
  } else {
    statusText = isAdmin ? "管理员" : "编辑者";
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

  if (hasEditPermission) {
    const formRow = document.createElement("tr");
    formRow.id = "form-row";
    formRow.innerHTML = `
            <td><span class="player-name">${escapeHTML(currentUser)}</span></td>
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

// --- 数据操作 (无二次验证) ---

async function handleSubmit() {
  if (!hasEditPermission) {
    alert("无修改权限！");
    return;
  }

  const scoreInput = document.getElementById("score-input");
  const videoInput = document.getElementById("video-input");
  const editingIdInput = document.getElementById("editing-id-input");

  const entryData = {
    "选手": currentUser,
    "成绩": scoreInput.value.trim() || "无",
    "视频": videoInput.value.trim() || "无",
  };

  const currentId = editingIdInput.value;

  try {
    let error;
    // 直接使用全局的 supabaseClient，它已被 showApp() 正确配置
    if (currentId) {
      ({ error } = await supabaseClient.from("scores").update({ data: entryData }).eq("id", currentId));
    } else {
      ({ error } = await supabaseClient.from("scores").insert([{ creator_username: currentUser, data: entryData }]));
    }
    if (error) throw error;

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
      // 直接使用全局的 supabaseClient
      const { error } = await supabaseClient.from("scores").delete().eq("id", id);
      if (error) throw error;
      await loadTableData();
    } catch (error) {
      alert(`删除出错: ${error.message}`);
    }
  }
}

async function loadTableData() {
  try {
    // 加载数据总是用默认客户端，因为它不需要特殊头
    const defaultClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await defaultClient.from("scores").select("*");
    if (error) throw error;
    tableData = data;
    renderTable();
  } catch (error) {
    console.error("加载数据失败:", error);
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
  // 在应用启动时，根据会话信息配置客户端
  showApp(currentUser);
} else {
  loginModal.classList.remove("hidden");
}
