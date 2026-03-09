export enum GameState {
    /** Waiting for the first tap to start */
    IDLE,
    /** Auto-running until first obstacle */
    RUNNING,
    /** Paused, showing "tap to jump" tutorial */
    TUTORIAL,
    /** Normal gameplay */
    PLAYING,
    /** Player reached the finish line */
    WIN,
    /** Player died */
    LOSE,
    /** Showing download prompt */
    DOWNLOAD,
}
