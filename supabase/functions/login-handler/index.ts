// supabase/functions/login-handler/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

// --- CORS Headers ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- 创建数据库连接池 ---
const databaseUrl = Deno.env.get("SUPABASE_DB_URL")!;
const pool = new Pool(databaseUrl, 3, true);

// --- JWT 配置 ---
const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET")!;

serve(async (req: Request) => {
  // 预检请求处理
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();

    if (!username) {
      throw new Error("Username is required.");
    }

    // 目标 1.5: 不输入密码，作为访客登录
    if (!password || password.trim() === "") {
      const guestPayload = {
        username: "访客",
        permission: "view", // 仅查看
        role: "anon",
        iss: "supabase",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24小时有效期
      };
      const guestToken = await djwt.create({ alg: "HS256", typ: "JWT" }, guestPayload, JWT_SECRET);
      return new Response(
        JSON.stringify({
          message: "Logged in as guest.",
          user: { username: "访客", permission: "view" },
          token: guestToken,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const connection = await pool.connect();
    let user;
    let permission = "view"; // 默认是查看权限
    let token;

    try {
      // 查询用户是否存在
      const result = await connection.queryObject("SELECT * FROM public.profiles WHERE username = $1", [username]);

      const existingUser = result.rows[0];

      if (existingUser) {
        // 用户存在，验证密码
        const passwordMatch = await bcrypt.compare(password, existingUser.encrypted_password as string);
        if (passwordMatch) {
          permission = "edit"; // 密码正确，授予编辑权限
        }
        user = { username: existingUser.username, permission };
      } else {
        // 用户不存在，创建新用户
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const insertResult = await connection.queryObject(
          "INSERT INTO public.profiles(username, encrypted_password) VALUES($1, $2) RETURNING username",
          [username, hashedPassword]
        );

        permission = "edit"; // 首次创建，授予编辑权限
        user = { username: insertResult.rows[0].username, permission };
      }

      // 目标 2: admin 用户有特殊权限
      const isAdmin = user.username.toLowerCase() === "admin" && permission === "edit";

      // 创建 JWT (访问令牌)
      const payload = {
        username: user.username,
        permission: user.permission,
        is_admin: isAdmin, // 添加 admin 标记
        role: "authenticated",
        iss: "supabase",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24小时有效期
      };

      token = await djwt.create({ alg: "HS256", typ: "JWT" }, payload, JWT_SECRET);
    } finally {
      connection.release();
    }

    return new Response(
      JSON.stringify({
        message: "Login successful.",
        user: user,
        token: token,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
