if !exists('g:bs_motion_key_left')
  let g:bs_motion_key_left = ['h']
endif
if !exists('g:bs_motion_key_down')
  let g:bs_motion_key_down = ['j']
endif
if !exists('g:bs_motion_key_up')
  let g:bs_motion_key_up   = ['k']
endif
if !exists('g:bs_motion_key_right')
  let g:bs_motion_key_right = ['l']
endif
if !exists('g:bs_motion_key_exit')
  let g:bs_motion_key_exit = ['q', '<Esc>']
endif
if !exists('g:bs_motion_key_exit_transparent')
  let g:bs_motion_key_exit_transparent = ['w', 'b', 'e']
endif

if exists('g:loaded_bs_motion')
  finish
endif
let g:loaded_bs_motion = 1

" Function called once the plugin is loaded
function! s:init() abort
  command! BSMotionJumpEnter   call denops#request('bs-motion', 'enterJumpMode', [])
  command! BSMotionJumpLeave   call denops#request('bs-motion', 'leaveJumpMode', [])
  command! -nargs=1 BSMotionJumpMove call denops#request('bs-motion', 'jumpMove', [<f-args>])
endfunction

augroup bs_motion
  autocmd!
  autocmd User DenopsPluginPost:bs-motion call s:init()
augroup END
