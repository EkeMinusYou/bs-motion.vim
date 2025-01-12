import type { Entrypoint } from "jsr:@denops/std@^7.0.0";
import { execute } from "jsr:@denops/std@^7.0.0/helper/execute";
import { batch } from "jsr:@denops/std@^7.0.0/batch";
import * as fn from "jsr:@denops/std@^7.0.0/function";

/**
 * ジャンプ時の上下左右の境界や現在位置、マッピングキーを管理
 */
interface JumpState {
  jumpMode: boolean;    // ジャンプモード中かどうか

  // ジャンプ対象とするウィンドウ範囲 (行)
  topLine: number;      // 「上」方向の境界行番号 (w0)
  bottomLine: number;   // 「下」方向の境界行番号 (w$)

  // ジャンプ対象とするウィンドウ範囲 (列)
  leftCol: number;      // 「左」方向の境界列 (今回は 1 固定とする)
  rightCol: number;     // 「右」方向の境界列 (winwidth(0) など)

  // 現在位置 (ジャンプ後のカーソル行/列)
  currentLine: number;
  currentCol: number;

  // ユーザが設定するキー
  keyLeft: string;
  keyDown: string;
  keyUp: string;
  keyRight: string;
  keyExit: string;
}

const jumpState: JumpState = {
  jumpMode: false,

  topLine: 1,
  bottomLine: 1,
  leftCol: 1,
  rightCol: 1,

  currentLine: 1,
  currentCol: 1,

  keyLeft:  "",
  keyDown:  "",
  keyUp:    "",
  keyRight: "",
  keyExit:  "",
};

export const main: Entrypoint = (denops) => {
  denops.dispatcher = {
    /**
     * ジャンプモードに入る (ウィンドウの範囲を取得する)
     */
    async enterJumpMode(): Promise<void> {
      if (jumpState.jumpMode) {
        return;
      }
      jumpState.jumpMode = true;

      // 現在のカーソル位置
      const lnum = await fn.line(denops, ".");
      const col = await fn.col(denops, ".");
      jumpState.currentLine = lnum;
      jumpState.currentCol = col;

      // -- 今見えているウィンドウの上端・下端行を取得
      //    line('w0') : ウィンドウの最上行
      //    line('w$') : ウィンドウの最下行
      const topWinLine = await fn.line(denops, "w0");
      const bottomWinLine = await fn.line(denops, "w$");
      jumpState.topLine = topWinLine;
      jumpState.bottomLine = bottomWinLine;

      // -- ウィンドウ幅 (カラム数) を取得
      //    wrap の有無や実際の長い行の折り返しを厳密に考慮はしていません。
      //    シンプルに「1列目 ～ winwidth(0)列目」の範囲内で左右にジャンプします。
      const winWidth = await fn.winwidth(denops, 0);
      jumpState.leftCol = 1;
      jumpState.rightCol = winWidth > 0 ? winWidth : 1;

      // -- Vim script 側で設定されたキー (up/down/left/right/exit) を取得
      jumpState.keyLeft  = (await denops.eval("g:bs_motion_key_left"))  as string;
      jumpState.keyDown  = (await denops.eval("g:bs_motion_key_down"))  as string;
      jumpState.keyUp    = (await denops.eval("g:bs_motion_key_up"))    as string;
      jumpState.keyRight = (await denops.eval("g:bs_motion_key_right")) as string;
      jumpState.keyExit  = (await denops.eval("g:bs_motion_key_exit"))  as string;

      // -- バッファローカルマッピング (JumpMode 用)
      await execute(
        denops,
        `
          nnoremap <silent> <buffer> ${jumpState.keyLeft}  :call denops#request('bs-motion', 'jumpMove', ['left'])<CR>
          nnoremap <silent> <buffer> ${jumpState.keyDown}  :call denops#request('bs-motion', 'jumpMove', ['down'])<CR>
          nnoremap <silent> <buffer> ${jumpState.keyUp}    :call denops#request('bs-motion', 'jumpMove', ['up'])<CR>
          nnoremap <silent> <buffer> ${jumpState.keyRight} :call denops#request('bs-motion', 'jumpMove', ['right'])<CR>

          nnoremap <silent> <buffer> ${jumpState.keyExit} :call denops#request('bs-motion', 'leaveJumpMode', [])<CR>
        `,
      );
    },

    /**
     * ジャンプモードを抜ける (ローカルマッピングを解除)
     */
    async leaveJumpMode(): Promise<void> {
      if (!jumpState.jumpMode) {
        return;
      }
      jumpState.jumpMode = false;

      await batch(denops, async (denops) => {
        await execute(
          denops,
          [
            `nunmap <buffer> ${jumpState.keyLeft}`,
            `nunmap <buffer> ${jumpState.keyDown}`,
            `nunmap <buffer> ${jumpState.keyUp}`,
            `nunmap <buffer> ${jumpState.keyRight}`,
            `nunmap <buffer> ${jumpState.keyExit}`,
          ].join("\n"),
        );
      });
    },

    /**
     * ジャンプコマンド (up/down/left/right)
     *
     * ウィンドウの上端行～下端行、左端列～右端列の「範囲内」で
     * 現在位置から半分移動していく。
     */
    async jumpMove(direction: unknown): Promise<void> {
      if (typeof direction !== "string") {
        return;
      }
      if (!jumpState.jumpMode) {
        return;
      }

      let {
        currentLine,
        currentCol,
        topLine,
        bottomLine,
        leftCol,
        rightCol,
      } = jumpState;

      switch (direction) {
        case "up": {
          // ウィンドウの上端行 (topLine) ～ 現在行 の中間へ移動
          const newLine = Math.floor((topLine + currentLine) / 2);
          // 下端を旧位置に更新することで「バイナリサーチ」的に範囲を狭める
          bottomLine = currentLine;
          currentLine = newLine;
          break;
        }
        case "down": {
          // ウィンドウの下端行 (bottomLine) ～ 現在行 の中間へ移動
          const newLine = Math.floor((bottomLine + currentLine) / 2);
          // 上端を旧位置に更新
          topLine = currentLine;
          currentLine = newLine;
          break;
        }
        case "left": {
          // ウィンドウの左端列 (leftCol) ～ 現在列 の中間へ移動
          const newCol = Math.floor((leftCol + currentCol) / 2);
          // 右端を旧位置に更新
          rightCol = currentCol;
          currentCol = newCol;
          break;
        }
        case "right": {
          // ウィンドウの右端列 (rightCol) ～ 現在列 の中間へ移動
          const newCol = Math.floor((rightCol + currentCol) / 2);
          // 左端を旧位置に更新
          leftCol = currentCol;
          currentCol = newCol;
          break;
        }
        default: {
          // それ以外は無視
          return;
        }
      }

      // 範囲外に出そうになった場合の安全策
      if (currentLine < topLine) {
        currentLine = topLine;
      } else if (currentLine > bottomLine) {
        currentLine = bottomLine;
      }
      if (currentCol < leftCol) {
        currentCol = leftCol;
      } else if (currentCol > rightCol) {
        currentCol = rightCol;
      }

      // カーソルを移動
      await fn.cursor(denops, currentLine, currentCol);

      // 状態を更新
      jumpState.currentLine = currentLine;
      jumpState.currentCol = currentCol;
      jumpState.topLine = topLine;
      jumpState.bottomLine = bottomLine;
      jumpState.leftCol = leftCol;
      jumpState.rightCol = rightCol;
    },
  };
};
