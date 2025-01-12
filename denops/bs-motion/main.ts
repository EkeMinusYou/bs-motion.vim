import type { Denops, Entrypoint } from "jsr:@denops/std@^7.0.0";
import { execute } from "jsr:@denops/std@^7.0.0/helper/execute";
import * as fn from "jsr:@denops/std@^7.0.0/function";
import * as vars from "jsr:@denops/std@^7.0.0/variable";

/**
 * ジャンプ時の上下左右の境界や現在位置、ユーザ設定キー、ハイライト用IDを管理
 */
interface JumpState {
  jumpMode: boolean; // ジャンプモード中かどうか

  // ジャンプ対象とするウィンドウ範囲 (行)
  topLine: number; // 「上」方向の境界行番号 (w0)
  bottomLine: number; // 「下」方向の境界行番号 (w$)

  // ジャンプ対象とするウィンドウ範囲 (列)
  leftCol: number; // 「左」方向の境界列 (今回は 1 固定)
  rightCol: number; // 「右」方向の境界列 (winwidth(0) など)

  // 現在位置 (ジャンプ後のカーソル行/列)
  currentLine: number;
  currentCol: number;

  // ユーザが設定するキー（各キー群は、複数文字指定も可能）
  keyLeft: string[];
  keyDown: string[];
  keyUp: string[];
  keyRight: string[];
  keyExit: string[];
  keyExitTransparent: string[];

  // カーソル位置のハイライトの match ID（1文字分の位置を強調表示）
  cursorMatchId: number | null;

  // 範囲外部分 (シェード) のハイライトの match ID を保持（複数あるため配列）
  shadeMatchIds: number[];
}

const jumpState: JumpState = {
  jumpMode: false,

  topLine: 1,
  bottomLine: 1,
  leftCol: 1,
  rightCol: 1,

  currentLine: 1,
  currentCol: 1,

  keyLeft: [],
  keyDown: [],
  keyUp: [],
  keyRight: [],
  keyExit: [],
  keyExitTransparent: [],

  cursorMatchId: null,
  shadeMatchIds: [],
};

/**
 * 現在のカーソル位置のみをハイライトする
 */
async function updateCursorHighlight(denops: Denops): Promise<void> {
  // すでにカーソルハイライトが設定済みなら削除
  if (jumpState.cursorMatchId !== null) {
    await fn.matchdelete(denops, jumpState.cursorMatchId);
    jumpState.cursorMatchId = null;
  }
  // 現在位置の1文字をハイライトする
  jumpState.cursorMatchId = await fn.matchaddpos(
    denops,
    "BSMotionCursor",
    [[jumpState.currentLine, jumpState.currentCol, 1]],
    10,
  );
  await execute(denops, "redraw");
}

/**
 * 対象範囲外 (ジャンプ対象エリア外) にシェードハイライトを適用する
 */
async function updateShadeHighlight(denops: Denops): Promise<void> {
  // すでにシェードのハイライトが設定済みなら削除
  for (const id of jumpState.shadeMatchIds) {
    await fn.matchdelete(denops, id);
  }
  jumpState.shadeMatchIds = [];
  // ウィンドウ全体の範囲を取得
  const winTop = await fn.line(denops, "w0");
  const winBottom = await fn.line(denops, "w$");
  const winWidth = (await fn.winwidth(denops, 0)) || 1;

  const highlights: [number, number, number][] = [];

  // 上部シェード：ウィンドウ上端からジャンプ対象の上境界手前まで
  for (let line = winTop; line < jumpState.topLine; line++) {
    highlights.push([line, 1, winWidth]);
  }
  // 下部シェード：ジャンプ対象の下境界の次の行からウィンドウ下端まで
  for (let line = jumpState.bottomLine + 1; line <= winBottom; line++) {
    highlights.push([line, 1, winWidth]);
  }
  // 中央部分（左右）のシェード
  // 左側シェード：ジャンプ対象内の行の、左側の余白
  if (jumpState.leftCol > 1) {
    for (let line = jumpState.topLine; line <= jumpState.bottomLine; line++) {
      highlights.push([line, 1, jumpState.leftCol - 1]);
    }
  }
  // 右側シェード：ジャンプ対象内の行の、右側の余白
  if (jumpState.rightCol < winWidth) {
    for (let line = jumpState.topLine; line <= jumpState.bottomLine; line++) {
      highlights.push([line, jumpState.rightCol + 1, winWidth - jumpState.rightCol]);
    }
  }

  // 各範囲に対してシェードのハイライトを登録
  for (const pos of highlights) {
    const id = await fn.matchaddpos(denops, "BSMotionShade", [pos], 10);
    jumpState.shadeMatchIds.push(id);
  }
  await execute(denops, "redraw");
}

/**
 * ユーザから getchar() による入力を受け取り、どのキーに該当するかを判定する
 */
function getMatchedDirection(
  input: string,
  state: JumpState,
): "left" | "down" | "up" | "right" | "exit" | "exitTransparent" | null {
  if (state.keyLeft.some((k) => k.charAt(0) === input)) return "left";
  if (state.keyDown.some((k) => k.charAt(0) === input)) return "down";
  if (state.keyUp.some((k) => k.charAt(0) === input)) return "up";
  if (state.keyRight.some((k) => k.charAt(0) === input)) return "right";
  if (state.keyExit.some((k) => k.charAt(0) === input)) return "exit";
  if (state.keyExitTransparent.some((k) => k.charAt(0) === input)) return "exitTransparent";
  return null;
}

export const main: Entrypoint = (denops) => {
  denops.dispatcher = {
    /**
     * ジャンプモードに入る
     * ・ウィンドウの情報とユーザ設定のキーを取得
     * ・カーソルの位置のみをハイライト（BSMotionCursor）
     * ・対象範囲外は BSMotionShade でハイライト
     * ・以降、getChar() によって入力を待ち、該当するキーがあれば処理を行う
     */
    async enterJumpMode(): Promise<void> {
      if (jumpState.jumpMode) {
        return;
      }
      jumpState.jumpMode = true;

      // 現在のカーソル位置を取得
      jumpState.currentLine = await fn.line(denops, ".");
      jumpState.currentCol = await fn.col(denops, ".");

      // ウィンドウの上端・下端行を取得（初期対象範囲）
      jumpState.topLine = await fn.line(denops, "w0");
      jumpState.bottomLine = await fn.line(denops, "w$");

      // ウィンドウ幅 (カラム数) を取得
      jumpState.leftCol = 1;
      jumpState.rightCol = await fn.winwidth(denops, 0) || 1;

      // ユーザ設定のキー取得
      jumpState.keyLeft = (await vars.globals.get(denops, "bs_motion_key_left", [])) as string[];
      jumpState.keyDown = (await vars.globals.get(denops, "bs_motion_key_down", [])) as string[];
      jumpState.keyUp = (await vars.globals.get(denops, "bs_motion_key_up", [])) as string[];
      jumpState.keyRight = (await vars.globals.get(denops, "bs_motion_key_right", [])) as string[];
      jumpState.keyExit = (await vars.globals.get(denops, "bs_motion_key_exit", [])) as string[];
      jumpState.keyExitTransparent = (await vars.globals.get(denops, "bs_motion_key_exit_transparent", [])) as string[];

      // 現在位置のみのハイライトを適用
      await updateCursorHighlight(denops);
      // 対象範囲外にシェードハイライトを適用
      await updateShadeHighlight(denops);

      // 入力ループ（ジャンプモードが有効な間、1文字ずつ受付）
      while (jumpState.jumpMode) {
        const charOrCode = await fn.getchar(denops);
        let input = "";
        if (typeof charOrCode === "number") {
          input = String.fromCharCode(charOrCode);
        } else if (typeof charOrCode === "string") {
          input = charOrCode;
        }
        const matched = getMatchedDirection(input, jumpState);

        if (
          matched === "left" ||
          matched === "down" ||
          matched === "up" ||
          matched === "right"
        ) {
          await denops.dispatcher.jumpMove(matched);
        } else if (matched === "exit") {
          await denops.dispatcher.leaveJumpMode();
        } else if (matched === "exitTransparent") {
          await denops.dispatcher.leaveJumpModeTransparent(input);
        }
      }
    },

    /**
     * ジャンプモードを抜ける (ハイライト解除、最終的なジャンプ位置に固定)
     */
    async leaveJumpMode(): Promise<void> {
      if (!jumpState.jumpMode) {
        return;
      }
      jumpState.jumpMode = false;

      // カーソルハイライト削除
      if (jumpState.cursorMatchId !== null) {
        await fn.matchdelete(denops, jumpState.cursorMatchId);
        jumpState.cursorMatchId = null;
      }
      // シェードハイライト削除
      for (const id of jumpState.shadeMatchIds) {
        await fn.matchdelete(denops, id);
      }
      jumpState.shadeMatchIds = [];

      await fn.cursor(denops, jumpState.currentLine, jumpState.currentCol);
    },

    /**
     * ジャンプモードを抜け、入力されたキーを透過的に実行する
     */
    async leaveJumpModeTransparent(key: unknown): Promise<void> {
      if (typeof key !== "string") {
        return;
      }
      await denops.dispatcher.leaveJumpMode();
      await fn.execute(denops, `normal! ${key}`);
    },

    /**
     * ジャンプコマンド (up/down/left/right)
     * ウィンドウの境界範囲内で、現在位置から半分移動していく
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
          break;
        }
        case "down": {
          const newLine = Math.floor((bottomLine + currentLine) / 2);
          topLine = currentLine;
          currentLine = newLine;
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
        default:
          return;
      }

      // 範囲外にならないように調整（横方向）
      if (currentCol < leftCol) {
        currentCol = leftCol;
      } else if (currentCol > rightCol) {
        currentCol = rightCol;
      }
      // 現在行の行末より大きくなっていないかチェック
      const lineLength = await fn.strwidth(
        denops,
        await fn.getline(denops, currentLine),
      );
      if (currentCol > lineLength) {
        currentCol = lineLength > 0 ? lineLength : 1;
      }
      // 縦方向の安全対策
      if (currentLine < topLine) {
        currentLine = topLine;
      } else if (currentLine > bottomLine) {
        currentLine = bottomLine;
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

      // カーソル位置のハイライト更新
      await updateCursorHighlight(denops);
      // 対象範囲外のシェードハイライト更新
      await updateShadeHighlight(denops);

      // 範囲が1行/1列の場合は終了
      const lineRange = bottomLine - topLine;
      const colRange = rightCol - leftCol;
      if (lineRange <= 1 || colRange <= 1) {
        await denops.dispatcher.leaveJumpMode();
      }
    },
  };
};
