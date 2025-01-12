import type { Entrypoint } from "jsr:@denops/std@^7.0.0";
import { execute } from "jsr:@denops/std@^7.0.0/helper/execute";
import { batch } from "jsr:@denops/std@^7.0.0/batch";
import * as fn from "jsr:@denops/std@^7.0.0/function";

/**
 * ジャンプ時の上下左右の境界や現在位置、マッピングキーを管理
 */
interface JumpState {
  jumpMode: boolean;    // ジャンプモード中かどうか
  topLine: number;      // 「上」方向の境界行番号
  bottomLine: number;   // 「下」方向の境界行番号
  leftCol: number;      // 「左」方向の境界列
  rightCol: number;     // 「右」方向の境界列
  currentLine: number;  // 前回の移動後の行
  currentCol: number;   // 前回の移動後の列

  keyLeft: string;
  keyDown: string;
  keyUp: string;
  keyRight: string;
  keyExit: string;      // JumpMode を抜けるキー
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
     * ジャンプモードに入る
     */
    async enterJumpMode(): Promise<void> {
      if (jumpState.jumpMode) {
        return; // すでにモード中なら何もしない
      }
      jumpState.jumpMode = true;

      // 現在カーソル位置を取得
      const lnum = await fn.line(denops, ".");
      const col = await fn.col(denops, ".");
      jumpState.currentLine = lnum;
      jumpState.currentCol = col;

      // バッファ全体の最終行
      const lastLine = await fn.line(denops, "$");
      jumpState.topLine = 1;
      jumpState.bottomLine = lastLine;

      // 現在行の文字数
      const lineText = await fn.getline(denops, lnum) ?? "";
      jumpState.leftCol = 1;
      jumpState.rightCol = lineText.length === 0 ? 1 : lineText.length;

      // Vim script 側で設定されたキーを取得
      jumpState.keyLeft  = (await denops.eval("g:bs_motion_key_left"))  as string;
      jumpState.keyDown  = (await denops.eval("g:bs_motion_key_down"))  as string;
      jumpState.keyUp    = (await denops.eval("g:bs_motion_key_up"))    as string;
      jumpState.keyRight = (await denops.eval("g:bs_motion_key_right")) as string;
      jumpState.keyExit  = (await denops.eval("g:bs_motion_key_exit"))  as string;

      // JumpMode 用のバッファローカルマッピングを設定
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
     * ジャンプモードを抜ける
     */
    async leaveJumpMode(): Promise<void> {
      if (!jumpState.jumpMode) {
        return;
      }
      jumpState.jumpMode = false;

      // JumpMode 用に設定したローカルマッピングを解除
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
     * 移動コマンド
     * direction: 'up' | 'down' | 'left' | 'right'
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
          const newLine = Math.floor((topLine + currentLine) / 2);
          bottomLine = currentLine;
          currentLine = newLine;
          const lineText = await fn.getline(denops, currentLine) ?? "";
          leftCol = 1;
          rightCol = lineText.length === 0 ? 1 : lineText.length;
          currentCol = Math.min(currentCol, rightCol);
          break;
        }
        case "down": {
          const newLine = Math.floor((bottomLine + currentLine) / 2);
          topLine = currentLine;
          currentLine = newLine;
          const lineText = await fn.getline(denops, currentLine) ?? "";
          leftCol = 1;
          rightCol = lineText.length === 0 ? 1 : lineText.length;
          currentCol = Math.min(currentCol, rightCol);
          break;
        }
        case "left": {
          const newCol = Math.floor((leftCol + currentCol) / 2);
          rightCol = currentCol;
          currentCol = newCol;
          break;
        }
        case "right": {
          const newCol = Math.floor((rightCol + currentCol) / 2);
          leftCol = currentCol;
          currentCol = newCol;
          break;
        }
      }

      await fn.cursor(denops, currentLine, currentCol);

      jumpState.currentLine = currentLine;
      jumpState.currentCol = currentCol;
      jumpState.topLine = topLine;
      jumpState.bottomLine = bottomLine;
      jumpState.leftCol = leftCol;
      jumpState.rightCol = rightCol;
    },
  };
};
