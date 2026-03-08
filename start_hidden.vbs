' start_hidden.vbs
' Avvia ElettroquadriServer.exe senza finestra console visibile.
' Utile se non si vuole usare NSSM come servizio.
' Può essere messo in Avvio automatico di Windows o Task Scheduler.
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "ElettroquadriServer.exe", 0, False
