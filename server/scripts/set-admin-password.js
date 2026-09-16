import { gerarHashSenha } from "../auth.js";

const senha = process.argv[2];
if (!senha) {
  console.error("Uso: npm run setup:admin -- \"sua-senha\"");
  process.exit(1);
}

console.log("\nCole esta linha no seu .env:\n");
console.log(`ADMIN_PASSWORD_HASH=${gerarHashSenha(senha)}\n`);
