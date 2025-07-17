import { hash } from "https://esm.sh/bcrypt-ts@5.0.2";

const password = "Yt213912518"; // <-- 替换成你的 admin 密码
const hashedPassword = await hash(password, 10);

console.log("你的新 admin 密码哈希是:");
console.log(hashedPassword);
