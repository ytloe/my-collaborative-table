// script.js (v13 - The Definitive Debug & Fix Version)

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

// 【关键修复】只创建一次客户端，并用 const 保护它，防止被意外重新创建
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("[DEBUG] Initial Supabase client created.");

// --- 应用状态变量 ---
let currentUser = null;
let hasEditPermission = false;
let isAdmin = false;
let tableData = [];
const tableHeaders = ["选手", "成绩", "视频", "最近更改时间", "操作"];

// 【关键修复】一个新的函数，用于修改现有客户端实例的默认请求头
function setAuthHeaders(username) {
  if (username && username !== "访客" && hasEditPermission) {
    const encodedUsername = encodeURIComponent(username);
    // 这是修改现有实例请求头的正确方法，直接操作 rest.headers
    supabaseClient.rest.headers["x-username"] = encodedUsername;
    console.log(`[DEBUG] Auth headers SET for user: '${username}' (encoded: '${encodedUsername}')`);
  } else {
    // 清除自定义请求头，恢复默认状态
    delete supabaseClient.rest.headers["x-username"];
    console.log(`[DEBUG] Auth headers CLEARED.`);
  }
}

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
    // 此查询使用全局客户端的当前状态（此时应为默认状态）
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

  // 根据最终的权限状态，配置唯一的客户端实例的请求头
  setAuthHeaders(currentUser);

  let statusText;
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
  setAuthHeaders(null); // 清理请求头，恢复客户端为默认状态
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

// --- 数据操作 (无二次验证) ---

async function handleSubmit() {
  console.log("[DEBUG] handleSubmit called.");
  if (!hasEditPermission) {
    alert("无修改权限！");
    console.warn("[DEBUG] handleSubmit blocked due to no edit permission.");
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
  console.log(`[DEBUG] Preparing to submit data. Is updating: ${!!currentId}. Data:`, entryData);
  console.log("[DEBUG] Current headers on supabaseClient:", supabaseClient.rest.headers);

  try {
    let response;
    if (currentId) {
      console.log("[DEBUG] Executing UPDATE on 'scores' table.");
      response = await supabaseClient.from("scores").update({ data: entryData }).eq("id", currentId).select();
    } else {
      console.log("[DEBUG] Executing INSERT on 'scores' table.");
      response = await supabaseClient
        .from("scores")
        .insert([{ creator_username: currentUser, data: entryData }])
        .select();
    }

    console.log("[DEBUG] Supabase response:", response);
    const { error } = response;
    if (error) throw error;

    editingIdInput.value = "";
    scoreInput.value = "";
    videoInput.value = "";
    document.getElementById("submit-button").textContent = "上传";
    console.log("[DEBUG] Submission successful. Reloading table data.");
    await loadTableData();
  } catch (error) {
    console.error("[DEBUG] Error during submission:", error);
    alert(`操作失败: ${error.message}`);
  }
}

async function handleDelete(id) {
  console.log(`[DEBUG] handleDelete called for id: ${id}.`);
  if (!hasEditPermission) {
    alert("无修改权限！");
    console.warn("[DEBUG] handleDelete blocked due to no edit permission.");
    return;
  }

  if (confirm("确定要删除这条数据吗？")) {
    console.log("[DEBUG] User confirmed deletion.");
    try {
      console.log("[DEBUG] Executing DELETE on 'scores' table.");
      console.log("[DEBUG] Current headers on supabaseClient:", supabaseClient.rest.headers);
      const { error } = await supabaseClient.from("scores").delete().eq("id", id);
      if (error) throw error;
      console.log("[DEBUG] Deletion successful. Reloading table data.");
      await loadTableData();
    } catch (error) {
      console.error("[DEBUG] Error during deletion:", error);
      alert(`删除出错: ${error.message}`);
    }
  } else {
    console.log("[DEBUG] User canceled deletion.");
  }
}

async function loadTableData() {
  console.log("[DEBUG] loadTableData called.");
  try {
    // 读取数据是公开的，所以使用当前的客户端实例即可，RLS会允许
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
  // 在应用启动时，根据会话信息配置客户端
  showApp(currentUser);
} else {
  loginModal.classList.remove("hidden");
  console.log("[DEBUG] No session found. Showing login modal.");
}
