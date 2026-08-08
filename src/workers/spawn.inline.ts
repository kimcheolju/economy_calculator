import MonteCarloWorker from './montecarlo.worker?worker&inline'

/**
 * Monte Carlo 워커 생성 — 단일 파일(file://) 빌드용.
 *
 * `file://` 로 연 페이지는 불투명 출처(opaque origin)라 별도 파일에서 워커를
 * 생성할 수 없다. `?worker&inline` 은 워커 번들을 base64 로 묻어 Blob URL 로
 * 띄우므로 네트워크·파일 접근이 일어나지 않는다.
 *
 * 대신 워커 코드가 초기 번들에 포함되므로 호스팅 빌드에는 쓰지 않는다.
 */
export function spawnMonteCarloWorker(): Worker {
  return new MonteCarloWorker()
}
