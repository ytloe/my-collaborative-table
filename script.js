// script.js (v14 - The Final RPC Solution)

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
console.log("[DEBUG] Initial Supabase client created.");

// --- 应用状态变量 ---
let currentUser = null;
let hasEditPermission = false;
let isAdmin = false;
let tableData = [];
const tableHeaders = ["选手", "成绩", "视频", "最近更改时间", "操作"];

// --- 登录/注册处理 ---
async function handleLogin(username, password) {
  console.log(`[DEBUG] handleLogin started for user: '${username}'`);
  currentUser = username;

  if (!password) {
    console.log("[DEBUG] No password provided. Logging in as '访客'.");
    hasEditPermission = false;
    isAdmin = false;
    sessionStorage.setItem("sessionData", JSON.stringify({ username: "访客", hasEditPermission: false }));
    showApp("访客");
    return;
  }

  try {
    console.log("[DEBUG] Querying profile for user:", username);
    const { data: profile, error: selectError } = await supabaseClient
      .from("profiles")
      .select("encrypted_password")
      .eq("username", username)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      console.error("[DEBUG] Error fetching profile:", selectError);
      throw new Error(`查询用户信息时出错: ${selectError.message}`);
    }
    console.log("[DEBUG] Profile query result:", profile);

    if (profile) {
      console.log("[DEBUG] Profile found. Comparing password.");
      const passwordMatch = await compare(password, profile.encrypted_password);
      hasEditPermission = passwordMatch;
      console.log(`[DEBUG] Password match result: ${passwordMatch}`);
      if (!passwordMatch) {
        alert("密码错误！您将以只读模式登录。");
      }
    } else {
      console.log(`[DEBUG] Profile not found for "${username}". Registering silently.`);
      const hashedPassword = await hash(password, 10);
      console.log("[DEBUG] Password hashed. Inserting new profile.");
      const { data: insertedData, error: insertError } = await supabaseClient
        .from("profiles")
        .insert({ username, encrypted_password: hashedPassword })
        .select();

      if (insertError) {
        console.error("[DEBUG] Error inserting new profile:", insertError);
        if (insertError.code === "23505") throw new Error(`注册失败，用户名 "${username}" 已被占用。`);
        throw insertError;
      }
      console.log("[DEBUG] New profile inserted successfully:", insertedData);
      hasEditPermission = true;
    }

    isAdmin = username.toLowerCase() === "admin" && hasEditPermission;
    console.log(`[DEBUG] Login final state: isAdmin=${isAdmin}, hasEditPermission=${hasEditPermission}`);
    sessionStorage.setItem("sessionData", JSON.stringify({ username, hasEditPermission }));
    showApp(username);
  } catch (error) {
    console.error("[DEBUG] An error occurred in handleLogin:", error);
    alert(`登录处理失败: ${error.message}`);
    loginButton.disabled = false;
    loginButton.textContent = "进入";
  }
}

function showApp(name) {
  console.log(`[DEBUG] showApp called for user: '${name}', with edit permission: ${hasEditPermission}`);
  currentUser = name;

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
  console.log("[DEBUG] Logging out.");
  sessionStorage.clear();
  window.location.reload();
}

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  console.log("[DEBUG] Login form submitted.");
  loginButton.disabled = true;
  loginButton.textContent = "进入中...";

  const u = loginNameInput.value.trim();
  const p = loginPasswordInput.value.trim();
  await handleLogin(u || "访客", p);
});

logoutButton.addEventListener("click", logout);

// --- 界面渲染 ---
function renderTable() {
  console.log("[DEBUG] renderTable called.");
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

// --- 数据操作 (使用 RPC) ---

async function handleSubmit() {
  console.log("[DEBUG] handleSubmit called (RPC version).");
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
  console.log(`[DEBUG] Preparing to submit via RPC. Is updating: ${!!currentId}.`);

  try {
    let response;
    if (currentId) {
      console.log("[DEBUG] Calling RPC 'update_score'.");
      response = await supabaseClient.rpc("update_score", {
        record_id: Number(currentId),
        updater_name: currentUser,
        score_data: entryData,
      });
    } else {
      console.log("[DEBUG] Calling RPC 'insert_score'.");
      response = await supabaseClient.rpc("insert_score", {
        creator_name: currentUser,
        score_data: entryData,
      });
    }

    console.log("[DEBUG] RPC response:", response);
    const { error } = response;
    if (error) throw error;

    editingIdInput.value = "";
    scoreInput.value = "";
    videoInput.value = "";
    document.getElementById("submit-button").textContent = "上传";
    console.log("[DEBUG] Submission successful. Reloading table data.");
    await loadTableData();
  } catch (error) {
    console.error("[DEBUG] Error during RPC submission:", error);
    alert(`操作失败: ${error.message}`);
  }
}

async function handleDelete(id) {
  console.log(`[DEBUG] handleDelete called for id: ${id} (RPC version).`);
  if (!hasEditPermission) {
    alert("无修改权限！");
    return;
  }

  if (confirm("确定要删除这条数据吗？")) {
    console.log("[DEBUG] User confirmed deletion. Calling RPC 'delete_score'.");
    try {
      const { error } = await supabaseClient.rpc("delete_score", {
        record_id: Number(id),
        deleter_name: currentUser,
      });

      if (error) throw error;
      console.log("[DEBUG] Deletion successful. Reloading table data.");
      await loadTableData();
    } catch (error) {
      console.error("[DEBUG] Error during RPC deletion:", error);
      alert(`删除出错: ${error.message}`);
    }
  }
}

async function loadTableData() {
  console.log("[DEBUG] loadTableData called.");
  try {
    const { data, error } = await supabaseClient.from("scores").select("*");
    if (error) throw error;
    tableData = data;
    console.log("[DEBUG] Table data loaded successfully:", tableData);
    renderTable();
  } catch (error) {
    console.error("[DEBUG] Error loading table data:", error);
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

console.log("[DEBUG] Script initialization started.");
const savedSession = sessionStorage.getItem("sessionData");
console.log("[DEBUG] Saved session data:", savedSession);
if (savedSession) {
  const session = JSON.parse(savedSession);
  currentUser = session.username;
  hasEditPermission = session.hasEditPermission;
  isAdmin = hasEditPermission && currentUser.toLowerCase() === "admin";
  console.log("[DEBUG] Session restored. User:", currentUser, "HasEditPermission:", hasEditPermission);
  showApp(currentUser);
} else {
  loginModal.classList.remove("hidden");
  console.log("[DEBUG] No session found. Showing login modal.");
}
