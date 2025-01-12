import type { Entrypoint } from "jsr:@denops/std@^7.0.0";
import { batch, collect } from "jsr:@denops/std@^7.0.0/batch";
import * as buffer from "jsr:@denops/std@^7.0.0/buffer";
import * as fn from "jsr:@denops/std@^7.0.0/function";
import * as op from "jsr:@denops/std@^7.0.0/option";
import { Maze } from "npm:@thewizardbear/maze_generator@^0.4.0";

export const main: Entrypoint = (denops) => {
  denops.dispatcher = {
    async maze() {
      const { bufnr, winnr } = await buffer.open(denops, "maze://");

      const [winWidth, winHeight] = await collect(denops, (denops) => [
        fn.winwidth(denops, winnr),
        fn.winheight(denops, winnr),
      ]);
      const maze = new Maze({
        xSize: winWidth / 3,
        ySize: winHeight / 3,
      }).generate();
      const content = maze.getString();

      await batch(denops, async (denops) => {
        await buffer.replace(denops, bufnr, content.split(/\r?\n/g));
        await buffer.concrete(denops, bufnr);
        await op.bufhidden.setLocal(denops, "wipe");
        await op.modifiable.setLocal(denops, false);
      });
    },
  };
};
