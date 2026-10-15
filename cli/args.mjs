// 极简命令行参数解析：位置参数 + --flag / --key value / --key=value
export function parseArgs(argv = process.argv.slice(2)) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// 统一的错误出口：只打印信息，不打印堆栈（DEBUG=1 时打印）。
export async function main(fn) {
  try {
    await fn();
  } catch (e) {
    // Playwright 会把浏览器端的调用栈拼进 message，这里只保留说明文字。
    const msg = String(e.message)
      .replace(/^page\.evaluate: (Error: )?/, '')
      .split('\n')
      .filter(l => !/^\s+at /.test(l))
      .join('\n')
      .trim();
    console.error(`\n✗ ${msg}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
}
