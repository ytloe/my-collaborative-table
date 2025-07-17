// supabase/functions/env-checker/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async _req => {
  // 获取所有的环境变量
  const allEnvs = Deno.env.toObject();

  // 为了安全，我们在返回前隐藏敏感信息
  // 我们只关心 key 的名字，不关心 value
  const sensitiveKeys = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"];
  for (const key of sensitiveKeys) {
    if (allEnvs[key]) {
      allEnvs[key] = "[REDACTED]"; // 隐藏真实值
    }
  }

  // 特别处理我们正在寻找的 JWT Secret
  // 如果它存在，我们就把它也隐藏起来
  const jwtSecretKey = Object.keys(allEnvs).find(key => key.includes("JWT"));
  if (jwtSecretKey && allEnvs[jwtSecretKey]) {
    allEnvs[jwtSecretKey] = "[FOUND AND REDACTED]";
  }

  return new Response(
    JSON.stringify(allEnvs, null, 2), // 格式化 JSON 以方便阅读
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
});
