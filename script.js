// script.js (v9 - Simplified Frontend-Only Logic)
document.addEventListener("DOMContentLoaded", () => {
  // --- DOM 元素获取 ---
  const loginModal = document.getElementById("login-modal");
  const loginForm = document.getElementById("login-form");
  const loginNameInput = document.getElementById("login-name");
  const loginPasswordInput = document.getElementById("login-password");
  const appContainer = document.getElementById("app-container");
  const logoutButton = document.getElementById("logout-button");
  const tableHead = document.getElementById("table-head");
  const tableBody = document.getElementById("table-body");
  const usernameDisplay = document.getElementById("username-display");

  // --- Supabase 配置 ---
  const SUPABASE_URL = "https://uccwwlrxufwzljhxyiyu.supabase.co"; // 你的 URL
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjY3d3bHJ4dWZ3emxqaHh5aXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTcxMzgsImV4cCI6MjA2ODI5MzEzOH0.aNFS1Q1kxLo_BEJzlDjLQy2uQrK1K9AOPqbMDlvrTBA"; // 你的 Anon Key
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- 应用状态变量 ---
  let currentUser = null;
  let hasEditPermission = false;
  let isAdmin = false;
  let tableData = [];
  const tableHeaders = ["选手", "成绩", "视频", "最近更改时间", "操作"];

  // --- 登录与权限管理 ---

  // 1. 登录处理函数
  async function handleLogin(username, password) {
    // 目标 1.5: 不输入密码，作为访客
    if (!password) {
      currentUser = "访客";
      hasEditPermission = false;
      isAdmin = false;
      sessionStorage.setItem("sessionData", JSON.stringify({ username: currentUser, permission: "view" }));
      showApp();
      return;
    }

    try {
      // 查询用户是否存在
      const { data: profile, error: selectError } = await supabaseClient
        .from("profiles")
        .select("encrypted_password")
        .eq("username", username)
        .single();

      if (selectError && selectError.code !== "PGRST116") {
        // PGRST116 = not found
        throw selectError;
      }

      const { compare, hash } = await import("https://esm.sh/bcrypt-ts@5.0.2");

      if (profile) {
        // 用户存在，验证密码
        const passwordMatch = await compare(password, profile.encrypted_password);
        if (passwordMatch) {
          hasEditPermission = true;
        } else {
          alert("密码错误！你将以只读模式登录。");
          hasEditPermission = false;
        }
      } else {
        // 用户不存在，创建新用户
        if (confirm(`用户 "${username}" 不存在。是否使用此密码创建新用户并登录？`)) {
          const hashedPassword = await hash(password, 10);
          const { error: insertError } = await supabaseClient.from("profiles").insert({ username: username, encrypted_password: hashedPassword });
          if (insertError) throw insertError;
          hasEditPermission = true;
        } else {
          // 用户选择不创建，作为访客登录
          currentUser = "访客";
          hasEditPermission = false;
          isAdmin = false;
          sessionStorage.setItem("sessionData", JSON.stringify({ username: currentUser, permission: "view" }));
          showApp();
          return;
        }
      }

      // 设置当前用户状态
      currentUser = username;
      isAdmin = username.toLowerCase() === "admin" && hasEditPermission;
      sessionStorage.setItem(
        "sessionData",
        JSON.stringify({
          username: currentUser,
          permission: hasEditPermission ? "edit" : "view",
        })
      );
      showApp();
    } catch (error) {
      alert(`登录处理失败: ${error.message}`);
    }
  }

  // 2. 显示主应用
  function showApp() {
    let permissionText = "访客";
    if (currentUser !== "访客") {
      permissionText = hasEditPermission ? (isAdmin ? "管理员" : "编辑者") : "只读";
    }
    usernameDisplay.textContent = `欢迎, ${currentUser} (${permissionText})`;
    loginModal.classList.add("hidden");
    appContainer.classList.remove("hidden");
    loadTableData();
  }

  // 3. 登出
  function logout() {
    sessionStorage.clear();
    window.location.reload();
  }

  // 4. 登录表单事件
  loginForm.addEventListener("submit", e => {
    e.preventDefault();
    const u = loginNameInput.value.trim();
    const p = loginPasswordInput.value.trim();
    if (u) {
      handleLogin(u, p);
    } else {
      // 允许不输入用户名，直接作为访客
      handleLogin("访客", "");
    }
  });

  logoutButton.addEventListener("click", logout);

  // --- 界面渲染 ---
  function renderTable() {
    // ... 这部分渲染逻辑与之前版本基本相同，无需大改 ...
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
      dataRow.dataset.creator = rowData.creator_username;

      const formattedTime = new Date(rowData.updated_at)
        .toLocaleString("zh-CN", {
          /* ... */
        })
        .replace(/\//g, "-");

      const canModify = isAdmin || (hasEditPermission && rowData.creator_username === currentUser);
      const actionButtons = canModify ? `<button class="action-btn edit">修改</button> <button class="action-btn delete">删除</button>` : "仅查看";

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
  // 创建一个带有认证请求头的 Supabase 客户端实例
  function createAuthedClient() {
    if (!currentUser || currentUser === "访客") return supabaseClient; // 访客用默认客户端
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { "x-username": currentUser },
      },
    });
  }

  async function handleSubmit() {
    if (!hasEditPermission) return;

    const scoreInput = document.getElementById("score-input");
    const videoInput = document.getElementById("video-input");
    const editingIdInput = document.getElementById("editing-id-input");

    const entryData = {
      "选手": currentUser,
      "成绩": scoreInput.value.trim() || "无",
      "视频": videoInput.value.trim() || "无",
    };

    const currentId = editingIdInput.value;
    const authedClient = createAuthedClient();

    try {
      let error;
      if (currentId) {
        ({ error } = await authedClient.from("scores").update({ data: entryData }).eq("id", currentId));
      } else {
        ({ error } = await authedClient.from("scores").insert([{ creator_username: currentUser, data: entryData }]));
      }
      if (error) throw error;

      editingIdInput.value = "";
      scoreInput.value = "";
      videoInput.value = "";
      document.getElementById("submit-button").textContent = "上传";
      await loadTableData();
    } catch (error) {
      alert(`操作失败: ${error.message}. 请检查权限或网络连接。`);
    }
  }

  async function handleDelete(id) {
    if (confirm("确定要删除这条数据吗？")) {
      try {
        const authedClient = createAuthedClient();
        const { error } = await authedClient.from("scores").delete().eq("id", id);
        if (error) throw error;
        await loadTableData();
      } catch (error) {
        alert(`删除出错: ${error.message}`);
      }
    }
  }

  async function loadTableData() {
    try {
      // 加载数据不需要特殊权限，用默认客户端即可
      const { data, error } = await supabaseClient.from("scores").select("*");
      if (error) throw error;
      tableData = data;
      renderTable();
    } catch (error) {
      alert(`加载数据失败: ${error.message}`);
    }
  }

  tableBody.addEventListener("click", e => {
    // ... 这部分事件委托逻辑与之前版本基本相同 ...
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
    const { username, permission } = JSON.parse(savedSession);
    currentUser = username;
    hasEditPermission = permission === "edit";
    isAdmin = username.toLowerCase() === "admin" && hasEditPermission;
    showApp();
  } else {
    loginModal.classList.remove("hidden");
  }
});
