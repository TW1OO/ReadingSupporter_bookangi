declare module 'webgazer' {
  export interface WebGazerPrediction {
    x: number;
    y: number;
  }
  export interface WebGazerApi {
    params: { faceMeshSolutionPath: string; [key: string]: unknown };
    setRegression(name: string): WebGazerApi;
    setTracker(name: string): WebGazerApi;
    setGazeListener(
      cb: (data: WebGazerPrediction | null, elapsedMs: number) => void,
    ): WebGazerApi;
    saveDataAcrossSessions?(v: boolean): WebGazerApi;
    applyKalmanFilter?(v: boolean): WebGazerApi;
    showVideo?(v: boolean): WebGazerApi;
    showVideoPreview?(v: boolean): WebGazerApi;
    showPredictionPoints?(v: boolean): WebGazerApi;
    showFaceOverlay?(v: boolean): WebGazerApi;
    showFaceFeedbackBox?(v: boolean): WebGazerApi;
    removeMouseEventListeners?(): WebGazerApi;
    recordScreenPosition?(x: number, y: number, eventType?: string): void;
    clearData?(): Promise<void> | void;
    begin(onFail?: () => void): Promise<WebGazerApi> | WebGazerApi;
    pause(): WebGazerApi;
    resume(): Promise<WebGazerApi> | WebGazerApi;
    end(): WebGazerApi;
    isReady?(): boolean;
  }
  const webgazer: WebGazerApi;
  export default webgazer;
}
