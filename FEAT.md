# New features

## Left menu bar (COMPLETED)
  - when icon is clicked, show the corresponding section
  - if section already open, close the left panel

## Headers
  - Headers (top bar) in left panel and center/main panel are same height in all sections

### Chats (COMPLETED)
  - left panel behavior: 
    - top label is "Chats" (aligned left) with file icon and "+" icon (aligned right)
    - folder icon create new folder in ~/.sapio/chats/ and is listed in the panel
    - "+" icon create a new chat (not inside a folder)
    - chats are autorenamed after first interaction
    - if a folder/file is created manualy it is also visible in the app 
    - folder can be expanded/collapsed, and "+" (aligned right) allow to create chat in that folder
    - file/folder 3 vertical dot on hover (aligned left), when clicked show menu (rename,pin/unpin, delete) 
  - center/main panel:
    - top bar contains chat name (aligned left) and ghost icon (aligned right)
    - ghost icon create new chat but doesn't log it (no file created) - the icon and text change so the user knows it is an incognito sessions

### Files (COMPLETED)
  - left panel behavior:
    - reuse patterns and code from Chats:
      - top label is "Workspace" (aligned left) with file icon and "+" icon (aligned right)
      - folder icon create new folder in working directory (defined in settings) and is listed in the panel
      - "+" icon create a new file (not inside a folder)
      - if a folder/file is created manualy it is also visible in the app 
      - folder can be expanded/collapsed, and "+" (aligned right) allow to create file in that folder
      - file/folder show 3 vertical dot on hover (aligned left), when clicked show menu (rename,pin/unpin, delete) 
  - center/main panel:
    - top bar contains tabs of open files (a dot is shown when file is unsaved, x to close when hover with unsave warning modal) 
    - support save (cmd+s), copy, paste, revert (cmd-z)
    - for now keep it simple: text viewer, with line numered, syntax highlight for markdown 

### Tasks (COMPLETED)
  - left panel behavior:
    - reuse patterns, code and ui from Chats:
      - top label is "Tasks" (aligned left) with folder icon(aligned right)
      - folder icon create new folder in ~/.sapio/tasks/ and is listed in the panel
      - if a folder/file is created manualy it is also visible in the app 
      - folder can be expanded/collapsed, and "+" (aligned right) allow to create task in that folder
      - folders show 3 vertical dot on hover (aligned left), when clicked show menu (rename,pin/unpin, delete), tasks show only: rename, delete
      - status (right side of task): green dot (sucessful), yellow dot (bug), red dot (incomplete) 
  - center/main panel:
    - top bar contains the name (aligned left) of current folder and have a "play", "stop" "retry" buttons which apply to each stages (play: take task in Backlog and put them "In Progress"; stop: stop all "In Progress" tasks; retry: take Done task with failed status and retry them), it shows a modal warning of what it will do
    - the Backlog column as a always new task card on top (the equivalent of +) which allows to create a new backlog task
    - task cards have a specific (start, stop, retry) button depending on stage and status 

### Sheduler (COMPLETED)
- left panel behavior:
    - reuse patterns, code and ui from Chats:
      - top label is "Scheduler" (aligned left) with folder icon and "+" icon (aligned right)
      - folder icon create new folder in ~/.sapio/scheduler/ and is listed in the panel
      - "+" icon create a new file/backlog (not inside a folder) 
      - if a folder/file is created manualy it is also visible in the app 
      - folder can be expanded/collapsed, and "+" (aligned right) allow to create sheduler in that folder
      - folders show 3 vertical dot on hover (aligned left), when clicked show menu (rename,pin/unpin, delete), tasks show only: rename, delete
      - status (right side of task): green dot (sucessful), yellow dot (bug), red dot (incomplete) 
  - center/main panel:
    - top bar contains the name (aligned left) of current folder and have a "Run now" buttons which the current scheduler
    - the main panel contains the form for scheduler

### Toolbox
- left panel behavior:
    - reuse patterns, code and ui from Chats:
      - top label is "Toolbox" (aligned left)
      - folders are fixed (prompts, skills, agents, memories, workflows) and are in ~/.sapio/
      - folder can be expanded/collapsed, and "+" (aligned right) allow to create tool in that folder
      - folders show 3 vertical dot on hover (aligned left), when clicked show menu (rename,pin/unpin, delete), tasks show only: rename, delete
  - center/main panel:
    - top bar contains the name (aligned left) 
    - the main panel contains the txt file viewer
    - line count and syntax highlighting (md, json, yaml)