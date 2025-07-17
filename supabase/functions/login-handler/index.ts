// supabase/functions/login-handler/index.ts (v5 - Final JWT Fix)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts";
import { hash, compare } from "https://esm.sh/bcrypt-ts@5.0.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 【关键修复】在函数顶部获取并检查 JWT Secret
    const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET");
    if (!JWT_SECRET) {
      throw new Error("FATAL: SUPABASE_JWT_SECRET is not available in the function's environment.");
    }

    const { username, password } = await req.json();

    if (!username || typeof username !== "string" || username.trim() === "") {
      throw new Error("Username is required.");
    }

    if (!password || password.trim() === "") {
      const guestPayload = {
        username: "访客",
        permission: "view",
        role: "anon",
        iss: "supabase",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      };
      // 【关键修复】使用我们验证过的 JWT_SECRET 变量
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

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let user;
    let permission = "view";

    const { data: existingUser } = await supabaseAdmin.from("profiles").select("username, encrypted_password").eq("username", username).single();

    if (existingUser) {
      const passwordMatch = await compare(password, existingUser.encrypted_password);
      if (passwordMatch) {
        permission = "edit";
      }
      user = { username: existingUser.username, permission };
    } else {
      const hashedPassword = await hash(password, 10);
      const { data: newUser } = await supabaseAdmin
        .from("profiles")
        .insert({ username: username, encrypted_password: hashedPassword })
        .select("username")
        .single();
      if (!newUser) throw new Error("Failed to create new user profile.");
      permission = "edit";
      user = { username: newUser.username, permission };
    }

    const isAdmin = user.username.toLowerCase() === "admin" && permission === "edit";
    const jwtPayload = {
      username: user.username,
      permission: user.permission,
      is_admin: isAdmin,
      role: "authenticated",
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };

    // 【关键修复】使用我们验证过的 JWT_SECRET 变量
    const token = await djwt.create({ alg: "HS256", typ: "JWT" }, jwtPayload, JWT_SECRET);

    return new Response(
      JSON.stringify({
        message: "Login successful.",
        user: user,
        token: token,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in login-handler:", error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
