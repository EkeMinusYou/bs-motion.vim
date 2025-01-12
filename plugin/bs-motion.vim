if exists('g:loaded_bs_motion')
  finish
endif
let g:loaded_bs_motion = 1

" Function called once the plugin is loaded
function! s:init() abort
  command! -buffer BSMotionJumpEnter  call denops#request('bs-motion', 'enterJumpMode', [])
  command! -buffer BSMotionJumpLeave  call denops#request('bs-motion', 'leaveJumpMode', [])
  command! -buffer -nargs=1 BSMotionJumpMove call denops#request('bs-motion', 'jumpMove', [<f-args>])
endfunction

augroup bs_motion
  autocmd!
  autocmd User DenopsPluginPost:bs-motion call s:init()
augroup END
