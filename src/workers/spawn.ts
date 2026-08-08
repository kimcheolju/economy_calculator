/**
 * Monte Carlo 워커 생성 — 기본(호스팅) 빌드용.
 *
 * 워커를 별도 청크로 두어 초기 로드에서 분리한다 (design/06-architecture.md §5).
 * Monte Carlo 를 한 번도 실행하지 않는 사용자는 이 코드를 받지 않는다.
 *
 * 단일 파일 빌드(`npm run build:local`)에서는 vite.config.ts 의 alias 가 이 모듈을
 * `spawn.inline.ts` 로 바꿔치기한다. 컴포넌트 쪽에는 분기가 없다.
 */
export function spawnMonteCarloWorker(): Worker {
  return new Worker(new URL('./montecarlo.worker.ts', import.meta.url), { type: 'module' })
}
