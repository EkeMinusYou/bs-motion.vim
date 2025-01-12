import type { Entrypoint } from "jsr:@denops/std@^7.0.0";
import * as fn from "jsr:@denops/std@^7.0.0/function";

/**
 * ジャンプ時の上下左右の境界や現在位置を管理するための状態
 */
interface JumpState {
  jumpMode: boolean; // ジャンプモード中かどうか
  topLine: number; // 「上」方向の境界行番号
  bottomLine: number; // 「下」方向の境界行番号
  leftCol: number; // 「左」方向の境界列
  rightCol: number; // 「右」方向の境界列
  currentLine: number; // 前回の移動後の行
  currentCol: number; // 前回の移動後の列
}

const jumpState: JumpState = {
  jumpMode: false,
  topLine: 1,
  bottomLine: 1,
  leftCol: 1,
  rightCol: 1,
  currentLine: 1,
  currentCol: 1,
};

export const main: Entrypoint = (denops) => {
  denops.dispatcher = {
    /**
     * ジャンプモードに入る
     */
    async enterJumpMode(): Promise<void> {
      if (jumpState.jumpMode) {
        // 既にモード中なら何もしない
        return;
      }
      jumpState.jumpMode = true;

      // 現在位置を基準に、上下・左右の境界を初期化する
      const lnum = await fn.line(denops, ".");
      const col = await fn.col(denops, ".");
      jumpState.currentLine = lnum;
      jumpState.currentCol = col;

      // バッファ全体の最終行
      const lastLine = await fn.line(denops, "$");
      jumpState.topLine = 1;
      jumpState.bottomLine = lastLine;

      // 現在行の長さを取得して左右の境界を決定
      const lineText = await fn.getline(denops, lnum) ?? "";
      jumpState.leftCol = 1;
      jumpState.rightCol = lineText.length === 0 ? 1 : lineText.length;
    },

    /**
     * ジャンプモードを抜ける
     */
    leaveJumpMode(): void {
      if (!jumpState.jumpMode) {
        return;
      }
      jumpState.jumpMode = false;
    },

    /**
     * 移動コマンド
     * direction: 'up' | 'down' | 'left' | 'right'
     *
     * 2回目以降は「前回移動前の位置を境界」として計算し、
     * 徐々に狙った行・列に近づいていく。
     */
    async jumpMove(direction: unknown): Promise<void> {
      if (typeof direction !== "string") {
        return;
      }
      if (!jumpState.jumpMode) {
        // ジャンプモードじゃない場合は無視
        return;
      }

      // いまの状態を変数に
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
          // topLine と currentLine の中間へ移動 (小数点以下切り捨て)
          const newLine = Math.floor((topLine + currentLine) / 2);
          // 移動後、下限を“直前の currentLine”に変更
          bottomLine = currentLine;
          currentLine = newLine;

          // 移動先の行の長さにあわせて左右境界を再設定
          const lineText = await fn.getline(denops, currentLine) ?? "";
          leftCol = 1;
          rightCol = lineText.length === 0 ? 1 : lineText.length;
          // 列位置が境界外に出ていればクリップ
          currentCol = Math.min(currentCol, rightCol);
          break;
        }

        case "down": {
          // bottomLine と currentLine の中間へ移動 (小数点以下切り捨て)
          const newLine = Math.floor((bottomLine + currentLine) / 2);
          // 移動後、上限を“直前の currentLine”に変更
          topLine = currentLine;
          currentLine = newLine;

          // 移動先の行の長さにあわせて左右境界を再設定
          const lineText = await fn.getline(denops, currentLine) ?? "";
          leftCol = 1;
          rightCol = lineText.length === 0 ? 1 : lineText.length;
          // 列位置が境界外に出ていればクリップ
          currentCol = Math.min(currentCol, rightCol);
          break;
        }

        case "left": {
          // leftCol と currentCol の中間へ移動
          const newCol = Math.floor((leftCol + currentCol) / 2);
          // 移動後、右限を“直前の currentCol”に変更
          rightCol = currentCol;
          currentCol = newCol;
          break;
        }

        case "right": {
          // rightCol と currentCol の中間へ移動
          const newCol = Math.floor((rightCol + currentCol) / 2);
          // 移動後、左限を“直前の currentCol”に変更
          leftCol = currentCol;
          currentCol = newCol;
          break;
        }

        default:
          // それ以外は何もしない
          return;
      }

      // 実際にカーソル移動
      await fn.cursor(denops, currentLine, currentCol);

      // 状態を更新して保存
      jumpState.currentLine = currentLine;
      jumpState.currentCol = currentCol;
      jumpState.topLine = topLine;
      jumpState.bottomLine = bottomLine;
      jumpState.leftCol = leftCol;
      jumpState.rightCol = rightCol;
    },
  };
};
