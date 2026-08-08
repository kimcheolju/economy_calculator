import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

/**
 * 단일 파일 빌드 모드는 `--mode standalone` 으로 켠다 (`npm run build:local`).
 * 환경변수 대신 mode 를 쓰는 이유: `SINGLE_FILE=1 vite build` 형태는 PowerShell 에서
 * 동작하지 않고, cross-env 를 의존성으로 들이지 않기 위해서다 (CLAUDE.md §2).
 * 'local' 은 쓸 수 없다 — Vite 가 `.env.local` 접미사와 충돌한다며 거부한다.
 */
const SINGLE_FILE_MODE = 'standalone'

/**
 * 세제 룰셋의 기준일을 빌드 시점에 주입한다.
 * 사용자가 오래된 배포를 보고 있는지 스스로 판단할 수 있게 하는 유일한 장치.
 * (design/06-architecture.md §7)
 */
function readTaxMeta(): { id: string; asOf: string } {
  try {
    const src = readFileSync(new URL('./src/data/tax/kr-2026.ts', import.meta.url), 'utf8')
    const id = /id:\s*'([^']+)'/.exec(src)?.[1] ?? 'unknown'
    const asOf = /const AS_OF = '([^']+)'/.exec(src)?.[1] ?? 'unknown'
    return { id, asOf }
  } catch {
    return { id: 'unknown', asOf: 'unknown' }
  }
}

const taxMeta = readTaxMeta()
const buildDate = new Date().toISOString().slice(0, 10)

/**
 * CSP는 프로덕션 빌드에만 주입한다 (design/06-architecture.md §6).
 * `connect-src 'none'` 은 "서버로 데이터를 보내지 않는다"를 브라우저 수준에서 강제하지만,
 * 개발 서버의 HMR 웹소켓도 함께 막으므로 dev 에서는 넣지 않는다.
 */
const CSP =
  "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; " +
  "style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self' blob:; " +
  "object-src 'none'; base-uri 'self'; form-action 'none'"

/**
 * 단일 파일 빌드용 CSP.
 *
 * `file://` 로 연 문서는 불투명 출처라 `'self'` 가 자기 자신과도 매칭되지 않는다.
 * 그래서 출처 기반 지시어(default-src·script-src·style-src)는 뺀다.
 * 다만 이 앱의 핵심 약속인 `connect-src 'none'`(R-7 — 사용자 데이터가 네트워크로
 * 나가지 않는다)은 출처와 무관하게 동작하므로 그대로 유지한다.
 */
const CSP_SINGLE_FILE = "connect-src 'none'; object-src 'none'; form-action 'none'"

function cspPlugin(singleFile: boolean): Plugin {
  return {
    name: 'inject-csp-on-build',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { server?: unknown }) {
        if (ctx.server) return html.replace('<!--CSP_PLACEHOLDER-->', '')
        const policy = singleFile ? CSP_SINGLE_FILE : CSP
        return html.replace(
          '<!--CSP_PLACEHOLDER-->',
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        )
      },
    },
  }
}

/**
 * 엔트리 JS와 CSS를 HTML 안으로 옮기고 원본 파일을 번들에서 제거한다.
 *
 * 전용 플러그인을 의존성으로 추가하지 않는 이유: 하는 일이 아래 40줄이 전부이고,
 * 이 프로젝트는 새 의존성에 보수적이다 (CLAUDE.md §2).
 */
function inlineAssetsPlugin(): Plugin {
  return {
    name: 'inline-assets-into-html',
    enforce: 'post',

    /*
     * inlineDynamicImports 를 켜면 Vite 는 동적 import 를
     * `__vitePreload(fn, __VITE_PRELOAD__, import.meta.url)` 로 감싸 놓고도
     * `__VITE_PRELOAD__` 자리표시자를 치환하지 않는다 — 치환은 청크 분할 경로에서만 일어난다.
     * 그대로 두면 로드 즉시 ReferenceError 로 앱이 통째로 죽는다(실제로 그랬다).
     *
     * `define` 으로는 못 고친다. define 은 transform 단계인데 이 자리표시자는
     * 그 뒤 import 분석 단계에서 주입되기 때문이다. 그래서 renderChunk 에서 처리한다.
     * 파일이 하나뿐이라 미리 받아둘 청크도 없고, 헬퍼는 `deps || []` 로 undefined 를 허용한다.
     */
    renderChunk(code) {
      if (!code.includes('__VITE_PRELOAD__')) return null
      return { code: code.replace(/__VITE_PRELOAD__/g, 'void 0'), map: null }
    },

    generateBundle(_options, bundle) {
      const htmlEntry = Object.entries(bundle).find(([name]) => name.endsWith('.html'))
      if (!htmlEntry) return
      const [, htmlAsset] = htmlEntry
      if (htmlAsset.type !== 'asset' || typeof htmlAsset.source !== 'string') return

      let html = htmlAsset.source

      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && name.endsWith('.css')) {
          const css = String(chunk.source)
          html = html.replace(
            new RegExp(`<link[^>]+href="[^"]*${escapeRegExp(name)}"[^>]*>`),
            // 치환 문자열의 $ 가 특수문자로 해석되지 않도록 함수 형태로 넘긴다
            () => `<style>${css}</style>`,
          )
          delete bundle[name]
        }
      }

      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          // 번들 코드에 </script> 리터럴이 있으면 HTML 파서가 스크립트를 조기 종료한다
          const code = chunk.code.replace(/<\/script/gi, '<\\/script')
          html = html.replace(
            new RegExp(`<script[^>]+src="[^"]*${escapeRegExp(name)}"[^>]*></script>`),
            () => `<script type="module">${code}</script>`,
          )
          delete bundle[name]
        }
      }

      // 인라인된 뒤에는 가리킬 파일이 없다
      html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '')

      htmlAsset.source = html
    },
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default defineConfig(({ mode }) => {
  const singleFile = mode === SINGLE_FILE_MODE

  return {
    base: singleFile ? './' : (process.env.BASE_PATH ?? '/'),
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(singleFile),
      ...(singleFile ? [inlineAssetsPlugin()] : []),
    ],
    resolve: {
      // 배열 형태여야 순서가 보장된다 — 더 구체적인 규칙이 '@' 보다 먼저 와야 한다
      alias: [
        ...(singleFile
          ? [
              {
                find: /^@\/workers\/spawn$/,
                replacement: fileURLToPath(new URL('./src/workers/spawn.inline.ts', import.meta.url)),
              },
            ]
          : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    define: {
      __BUILD_DATE__: JSON.stringify(buildDate),
      __TAX_RULESET_ID__: JSON.stringify(taxMeta.id),
      __TAX_AS_OF__: JSON.stringify(taxMeta.asOf),
    },
    build: {
      target: 'es2022',
      outDir: singleFile ? 'dist-local' : 'dist',
      /*
       * 프리로드할 별도 청크가 없으므로 끈다.
       * 주의: 이것만으로는 `__VITE_PRELOAD__` 자리표시자가 사라지지 않는다 —
       * 그 문제는 inlineAssetsPlugin 의 renderChunk 가 처리한다. 실측으로 확인했다.
       */
      ...(singleFile ? { modulePreload: false as const } : {}),
      // 파일이 하나뿐이므로 별도 자산·청크가 남으면 안 된다
      assetsInlineLimit: singleFile ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: !singleFile,
      rollupOptions: {
        output: singleFile
          ? { inlineDynamicImports: true }
          : {
              manualChunks(id: string) {
                if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
                  return 'charts'
                }
                return undefined
              },
            },
      },
    },
  }
})
