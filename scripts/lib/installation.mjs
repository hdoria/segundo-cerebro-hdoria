// Resolução das duas pastas da instalação: o vault (dados do dono) e o motor (código).
// Instalação legada usa uma pasta só; instalação nova separa as duas e liga o vault ao
// motor por um ponteiro em `.cerebro/motor`. Nada aqui grava arquivo.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve, sep, win32 } from 'node:path';

export const MOTOR_POINTER = '.cerebro/motor';
export const MOTOR_MANIFEST = '.cerebro/motor.manifest';
// Marca a pasta que é só o motor de uma instalação dividida (gravada pelo instalador e pelo update).
export const MOTOR_ROLE = '.cerebro/motor-install.json';
const BRAIN_MANIFEST = '.cerebro/manifest.json';
const PROJECTION_RECEIPT = '.cerebro/projection-state.json';
const MANAGED_BEGIN = '<!-- CEREBRO:MANAGED:BEGIN -->';

/** Caminho absoluto em qualquer plataforma (o ponteiro pode ter sido escrito em Windows). */
export function isAbsolutePath(value) {
  return typeof value === 'string' && (posix.isAbsolute(value) || win32.isAbsolute(value));
}

/** Lê `.cerebro/motor` (KEY=VALUE). Devolve null se não existe ou não traz MOTOR_DIR absoluto. */
export function readMotorPointer(vault) {
  let text;
  try {
    text = readFileSync(join(vault, MOTOR_POINTER), 'utf8');
  } catch {
    return null;
  }
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trimStart().startsWith('#')) values[match[1]] = match[2];
  }
  if (!isAbsolutePath(values.MOTOR_DIR)) return null;
  const motorDir = posix.isAbsolute(values.MOTOR_DIR) ? resolve(values.MOTOR_DIR) : values.MOTOR_DIR;
  return { motorDir, motorVersion: values.MOTOR_VERSION || null };
}

function hasPointer(dir) {
  return Boolean(dir) && existsSync(join(dir, MOTOR_POINTER));
}

function hasMotorManifest(dir) {
  return existsSync(join(dir, MOTOR_MANIFEST));
}

export function isSplitMotor(dir) {
  return Boolean(dir) && existsSync(join(dir, MOTOR_ROLE));
}

function within(target, folder) {
  const a = resolve(target);
  const b = resolve(folder);
  return a === b || a.startsWith(b + sep);
}

const MOTOR_REFUSAL = 'a pasta é o motor do Cérebro; grave dados do dono no vault (rode a partir do vault ou defina CEREBRO_INSTALL_ROOT)';

/**
 * Recusa gravar dado do dono no motor: a pasta alvo é o motor ou está dentro dele.
 * `roots` é o resultado de `resolveRoots`; sem ele não há vault conhecido e nada é recusado.
 */
export function assertNotMotor(root, roots = null) {
  if (!roots?.vault) return;
  const target = resolve(root);
  const insideMotor = roots.motor && within(target, roots.motor);
  const isMotor = hasMotorManifest(target) || isSplitMotor(target) || insideMotor;
  if (isMotor && target !== resolve(roots.vault)) throw new Error(MOTOR_REFUSAL);
}

// Procura o ponteiro `.cerebro/motor` do cwd para cima, como o git faz com `.git`.
function findVaultUp(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (hasPointer(dir)) return dir;
    if (dirname(dir) === dir) return '';
  }
}

/**
 * Descobre vault, motor e modo.
 * Vault: `explicit` (--root/--brain), depois CEREBRO_INSTALL_ROOT, depois a pasta mais próxima do cwd
 * (subindo) que tem o ponteiro do motor; sem nada disso, `fallback` ('script' = pasta do motor que
 * contém o script, 'cwd' = pasta atual), que é o comportamento legado de cada script.
 * Modo `split` exige o ponteiro `.cerebro/motor` no vault; sem ele, `legacy`.
 * Numa instalação dividida o motor nunca é aceito como vault, nem por fallback nem por estar dentro dele.
 */
export function resolveRoots({
  explicit = '',
  env = process.env,
  cwd = process.cwd(),
  scriptRoot = '',
  fallback = 'script',
} = {}) {
  const fromEnv = env.CEREBRO_INSTALL_ROOT ? resolve(env.CEREBRO_INSTALL_ROOT) : '';
  const ambient = fromEnv || findVaultUp(cwd);
  const script = scriptRoot ? resolve(scriptRoot) : '';
  let vault = explicit ? resolve(explicit) : ambient;
  if (!vault) vault = fallback === 'cwd' ? resolve(cwd) : (script || resolve(cwd));

  const pointer = readMotorPointer(vault);
  const motor = script
    || (env.CEREBRO_MOTOR_DIR ? resolve(env.CEREBRO_MOTOR_DIR) : '')
    || pointer?.motorDir
    || vault;
  const roots = { vault, motor, mode: pointer ? 'split' : 'legacy' };
  if (explicit && ambient) assertNotMotor(vault, { vault: ambient, motor });
  const splitMotor = isSplitMotor(motor) || isSplitMotor(vault) || (roots.mode === 'split' && resolve(motor) !== vault);
  if (splitMotor && within(vault, motor)) throw new Error(MOTOR_REFUSAL);
  return roots;
}

/** Para scripts de linha de comando: erro de raiz vira mensagem legível e saída 1, sem stack trace. */
export function resolveRootsOrExit(options) {
  try {
    return resolveRoots(options);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}

/**
 * Vault (manifesto company-brain) ou instalação legada de pasta única: VERSION mais
 * COMECE-AQUI.md, START-HERE.md ou a pasta `.cerebro` (formas que os scripts já aceitavam).
 */
export function isBrainRoot(root) {
  if (!root) return false;
  try {
    const manifest = JSON.parse(readFileSync(join(root, BRAIN_MANIFEST), 'utf8'));
    if (manifest?.protocol === 'company-brain') return true;
  } catch {
    // Sem manifesto legível, vale o formato legado.
  }
  return existsSync(join(root, 'VERSION'))
    && (existsSync(join(root, 'COMECE-AQUI.md')) || existsSync(join(root, 'START-HERE.md'))
      || existsSync(join(root, '.cerebro')));
}

/** Versão do produto: VERSION da própria pasta, senão a do motor apontado. Null se desconhecida. */
export function brainVersion(root) {
  const read = (dir) => {
    try {
      return readFileSync(join(dir, 'VERSION'), 'utf8').trim() || null;
    } catch {
      return null;
    }
  };
  const own = read(root);
  if (own) return own;
  const pointer = readMotorPointer(root);
  if (!pointer) return null;
  return read(pointer.motorDir) || pointer.motorVersion;
}

/** Versão que vai nos recibos: a do motor em instalação dividida, a da própria pasta no legado. */
export function productVersion(roots) {
  if (roots.mode === 'split') return brainVersion(roots.motor) || brainVersion(roots.vault);
  return brainVersion(roots.vault);
}

/** O vault já foi projetado pelo Cérebro: bloco gerenciado no AGENTS.md, manifesto company-brain ou recibo de projeção. */
export function isProjectedVault(vault) {
  if (existsSync(join(vault, PROJECTION_RECEIPT))) return true;
  try {
    if (JSON.parse(readFileSync(join(vault, BRAIN_MANIFEST), 'utf8'))?.protocol === 'company-brain') return true;
  } catch {
    // Sem manifesto legível, vale o bloco do AGENTS.md.
  }
  try {
    return readFileSync(join(vault, 'AGENTS.md'), 'utf8').includes(MANAGED_BEGIN);
  } catch {
    return false;
  }
}
