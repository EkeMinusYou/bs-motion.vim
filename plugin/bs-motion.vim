if exists('g:loaded_denops_maze')
  finish
endif
let g:loaded_denops_maze = 1

" Function called once the plugin is loaded
function! s:init() abort
  command! Maze call denops#request('bs-motion', 'maze', [])
endfunction

augroup denops_maze
  autocmd!
  autocmd User DenopsPluginPost:bs-motion call s:init()
augroup END
