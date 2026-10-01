#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "restaurantes.json");
const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];
const warnings = [];
const required = ["id", "nome", "tipo", "estado", "provincia", "zona", "localidade", "mapsQuery", "actualizado"];
const ids = new Set();
const names = new Set();
const types = new Set(["tasco","taberna","clássico","cervejaria","churrasqueira","marisqueira","petiscos","pastelaria","date / contemporâneo","fine dining","hotel-restaurante","restaurante","incerto"]);
const attrGroups = ["cozinhas","ambientes","ocasioes","caracteristicas"];
const attrAllowed = {
  cozinhas: new Set(["portuguesa","regional","peixe","marisco","carne","grelhados","petiscos","cerveja"]),
  ambientes: new Set(["clássico","casual","contemporâneo","romântico","familiar","grupo","tranquilo","animado"]),
  ocasioes: new Set(["almoço","jantar","date","família","grupo","negócios","celebração"]),
  caracteristicas: new Set(["esplanada","vista","histórico","hotel","cerveja","vinho","take-away","acessível"])
};
for (const [i,r] of rows.entries()) {
  for (const k of required) if (r[k] === undefined || r[k] === null || r[k] === "") errors.push(`#${i}: campo obrigatório vazio: ${k}`);
  if (ids.has(r.id)) errors.push(`ID duplicado: ${r.id}`); ids.add(r.id);
  const key = `${String(r.nome).trim().toLowerCase()}|${String(r.localidade).trim().toLowerCase()}`;
  if (names.has(key)) errors.push(`Nome + localidade duplicado: ${r.nome} | ${r.localidade}`); names.add(key);
  if (!types.has(r.tipo)) warnings.push(`#${i}: tipo fora do vocabulário: ${r.tipo}`);
  if (r.lat != null && (typeof r.lat !== "number" || r.lat < -90 || r.lat > 90)) errors.push(`#${i}: latitude inválida`);
  if (r.lon != null && (typeof r.lon !== "number" || r.lon < -180 || r.lon > 180)) errors.push(`#${i}: longitude inválida`);
  if (r.website && !/^https?:\/\//i.test(r.website)) warnings.push(`#${i}: website sem http(s): ${r.website}`);
  if (!r.atributos || typeof r.atributos !== "object") errors.push(`#${i}: atributos em falta ou inválidos`);
  else {
    for (const group of attrGroups) {
      if (!Array.isArray(r.atributos[group])) errors.push(`#${i}: atributos.${group} deve ser um array`);
      else for (const value of r.atributos[group]) if (!attrAllowed[group].has(value)) warnings.push(`#${i}: atributo fora do vocabulário (${group}): ${value}`);
    }
    if (r.atributos.preco && !["€","€€","€€€","€€€€"].includes(r.atributos.preco)) warnings.push(`#${i}: faixa de preço fora do vocabulário: ${r.atributos.preco}`);
    if (r.atributos.acessibilidade && !["sim","parcial","não","desconhecida"].includes(r.atributos.acessibilidade)) warnings.push(`#${i}: acessibilidade fora do vocabulário: ${r.atributos.acessibilidade}`);
  }
}
console.log(`Restaurantes: ${rows.length}`);
console.log(`IDs únicos: ${ids.size}`);
console.log(`Tipos únicos: ${new Set(rows.map(r => r.tipo)).size}`);
console.log(`Sem coordenadas: ${rows.filter(r => r.lat == null || r.lon == null).length}`);
console.log(`Sem website: ${rows.filter(r => !r.website).length}`);
console.log(`Sem especialidade: ${rows.filter(r => !r.especialidade).length}`);
if (warnings.length) { console.log(`Avisos: ${warnings.length}`); warnings.slice(0,20).forEach(x=>console.log(`  - ${x}`)); }
if (errors.length) { console.error(`Erros: ${errors.length}`); errors.slice(0,50).forEach(x=>console.error(`  - ${x}`)); process.exit(1); }
console.log("Validação OK.");
