// script.js (全新改造版)
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
  // ！！！替换成你自己的 Supabase 项目 URL 和 Anon Key ！！！
  const SUPABASE_URL = "https://uccwwlrxufwzljhxyiyu.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjY3d3bHJ4dWZ3emxqaHh5aXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTcxMzgsImV4cCI6MjA2ODI5MzEzOH0.aNFS1Q1kxLo_BEJzlDjLQy2uQrK1K9AOPqbMDlvrTBA";
  // const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  // const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  let supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- 应用状态变量 ---
  let currentUser = null;
  let hasEditPermission = false;
  let isAdmin = false;
  let tableData = [];
  const tableHeaders = ["选手", "成绩", "视频", "最近更改时间", "操作"];

  // --- 登录与权限管理 ---

  async function handleLogin(username, password) {
    try {
      const { data, error } = await supabase.functions.invoke("login-handler", {
        body: { username, password },
      });

      if (error) throw error;

      // Edge Function 成功返回数据
      const { user, token } = data;

      // 使用获取到的 JWT 设置 Supabase 客户端的会话
      await supabase.auth.setSession({ access_token: token, refresh_token: token });

      // 更新应用状态
      currentUser = user.username;
      hasEditPermission = user.permission === "edit";
      isAdmin = user.username.toLowerCase() === "admin" && hasEditPermission;

      // 将会话信息存储到 sessionStorage，以便刷新页面后能恢复
      sessionStorage.setItem("sessionData", JSON.stringify({ user, token }));

      // 更新UI
      showApp();
    } catch (error) {
      console.error("Login failed:", error);
      alert(`登录失败: ${error.data?.error || error.message}`);
      // 清理可能存在的旧会话
      await supabase.auth.signOut();
      sessionStorage.removeItem("sessionData");
    }
  }

  function showApp() {
    usernameDisplay.textContent = `欢迎, ${currentUser} (${isAdmin ? "管理员" : hasEditPermission ? "编辑者" : "访客"})`;
    loginModal.classList.add("hidden");
    appContainer.classList.remove("hidden");
    loadTableData();
  }

  async function logout() {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.reload();
  }

  loginForm.addEventListener("submit", e => {
    e.preventDefault();
    const u = loginNameInput.value.trim();
    const p = loginPasswordInput.value.trim(); // 允许密码为空
    if (u) {
      handleLogin(u, p);
    } else {
      alert("用户名不能为空！");
    }
  });

  logoutButton.addEventListener("click", logout);

  // --- 界面渲染 ---
  function renderTable() {
    tableHead.innerHTML = `<tr><th>${tableHeaders.join("</th><th>")}</th></tr>`;
    tableBody.innerHTML = ""; // 清空旧内容

    // 只有拥有编辑权限的用户才显示输入行
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

    // 按更新时间倒序排序
    tableData.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    tableData.forEach(rowData => {
      const dataRow = document.createElement("tr");
      dataRow.dataset.id = rowData.id;
      dataRow.dataset.creator = rowData.creator_username; // 存储创建者信息

      const formattedTime = new Date(rowData.updated_at)
        .toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        .replace(/\//g, "-");

      // 权限判断逻辑: admin 或者 (用户有编辑权限 且 这条数据是用户自己创建的)
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

  // --- 数据操作 (完全依赖 RLS) ---

  async function handleSubmit() {
    if (!hasEditPermission) return; // 没有编辑权限，直接返回

    const scoreInput = document.getElementById("score-input");
    const videoInput = document.getElementById("video-input");
    const editingIdInput = document.getElementById("editing-id-input");
    const submitButton = document.getElementById("submit-button");

    // 注意：这里的选手名应该是当前登录用户，而不是从表单读取
    const entryData = {
      "选手": currentUser,
      "成绩": scoreInput.value.trim() === "" ? "无" : scoreInput.value.trim(),
      "视频": videoInput.value.trim() === "" ? "无" : videoInput.value.trim(),
    };

    const currentId = editingIdInput.value;

    submitButton.textContent = "提交中...";
    submitButton.disabled = true;

    try {
      let error;
      if (currentId) {
        // 更新操作: RLS 会检查权限
        ({ error } = await supabase.from("scores").update({ data: entryData }).eq("id", currentId));
      } else {
        // 创建操作: RLS 会检查权限
        ({ error } = await supabase.from("scores").insert([{ creator_username: currentUser, data: entryData }]));
      }

      if (error) throw error;

      // 操作成功后，重置输入表单并重新加载数据
      editingIdInput.value = "";
      scoreInput.value = "";
      videoInput.value = "";
      submitButton.textContent = "上传";
      await loadTableData();
    } catch (error) {
      alert(`操作失败: ${error.message}. \n请检查权限或网络连接。`);
      // 失败后恢复按钮状态
      submitButton.textContent = currentId ? "更新" : "上传";
      submitButton.disabled = false;
    }
  }

  async function handleDelete(id) {
    if (confirm("确定要删除这条数据吗？")) {
      try {
        // 删除操作: RLS 会检查权限
        const { error } = await supabase.from("scores").delete().eq("id", id);
        if (error) throw error;
        await loadTableData();
      } catch (error) {
        alert(`删除出错: ${error.message}. \n注意：你只能删除自己创建的数据，或需要管理员权限。`);
      }
    }
  }

  async function loadTableData() {
    try {
      const { data, error } = await supabase.from("scores").select("*");
      if (error) throw error;
      tableData = data;
      renderTable();
    } catch (error) {
      console.error("加载数据失败:", error);
      alert(`加载数据失败: ${error.message}`);
    }
  }

  // --- 事件监听委托 ---
  tableBody.addEventListener("click", e => {
    const target = e.target;
    // 提交按钮
    if (target.id === "submit-button") {
      handleSubmit();
      return;
    }

    const row = target.closest("tr");
    if (!row || !row.dataset.id) return; // 确保是数据行

    const id = row.dataset.id;
    const canModify = isAdmin || (hasEditPermission && row.dataset.creator === currentUser);

    if (canModify) {
      if (target.classList.contains("edit")) {
        const rowToEdit = tableData.find(d => d.id == id); // 使用 == 因为 dataset.id 是字符串
        if (rowToEdit && hasEditPermission) {
          document.getElementById("score-input").value = rowToEdit.data["成绩"] || "";
          document.getElementById("video-input").value = rowToEdit.data["视频"] || "";
          document.getElementById("editing-id-input").value = id;
          document.getElementById("submit-button").textContent = "更新";
          window.scrollTo(0, 0);
        }
      } else if (target.classList.contains("delete")) {
        handleDelete(id);
      }
    }
  });

  // --- 初始化 ---
  function escapeHTML(str) {
    if (typeof str !== "string") return "";
    const p = document.createElement("p");
    p.textContent = str;
    return p.innerHTML;
  }

  // 页面加载时检查 sessionStorage 中是否有会话
  const savedSession = sessionStorage.getItem("sessionData");
  if (savedSession) {
    const { user, token } = JSON.parse(savedSession);
    // 恢复会话
    supabase.auth.setSession({ access_token: token, refresh_token: token }).then(() => {
      currentUser = user.username;
      hasEditPermission = user.permission === "edit";
      isAdmin = user.username.toLowerCase() === "admin" && hasEditPermission;
      showApp();
    });
  } else {
    loginModal.classList.remove("hidden");
  }
});
