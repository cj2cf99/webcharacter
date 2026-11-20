// Windows Script Host only. Keep this file ASCII for the system JScript engine.
var files = new ActiveXObject("Scripting.FileSystemObject");
var desktop = files.GetParentFolderName(WScript.ScriptFullName);
var executable = WScript.Arguments.Item(0);
WScript.Sleep(60000);
var shell = new ActiveXObject("WScript.Shell");
shell.Environment("Process").Remove("ELECTRON_RUN_AS_NODE");
new ActiveXObject("Shell.Application").ShellExecute(
    executable, '"' + desktop + '" --feiyue-login', desktop, "open", 1);
