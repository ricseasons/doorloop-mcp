# Reads and writes the DoorLoop API key in Windows Credential Manager, the Windows keychain.
# Usage: wincred.ps1 read | exists | write | delete
#   write takes the key on stdin, so it never appears on a command line.
param([Parameter(Mandatory = $true)][ValidateSet('read', 'exists', 'write', 'delete')][string]$Action)
$ErrorActionPreference = 'Stop'
$Target = 'doorloop-mcp'
$User = 'api-key'

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class DoorLoopCred {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    const int CRED_TYPE_GENERIC = 1;
    const int CRED_PERSIST_LOCAL_MACHINE = 2;

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CredRead(string target, int type, int flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CredWrite(ref CREDENTIAL credential, int flags);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CredDelete(string target, int type, int flags);

    [DllImport("advapi32.dll")]
    static extern void CredFree(IntPtr buffer);

    public static string Read(string target) {
        IntPtr p;
        if (!CredRead(target, CRED_TYPE_GENERIC, 0, out p)) return null;
        try {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2);
        } finally {
            CredFree(p);
        }
    }

    public static void Write(string target, string user, string secret) {
        byte[] bytes = Encoding.Unicode.GetBytes(secret);
        CREDENTIAL c = new CREDENTIAL();
        c.Type = CRED_TYPE_GENERIC;
        c.TargetName = target;
        c.UserName = user;
        c.Comment = "DoorLoop API key";
        c.Persist = CRED_PERSIST_LOCAL_MACHINE;
        c.CredentialBlobSize = bytes.Length;
        c.CredentialBlob = Marshal.AllocHGlobal(bytes.Length);
        try {
            Marshal.Copy(bytes, 0, c.CredentialBlob, bytes.Length);
            if (!CredWrite(ref c, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
        } finally {
            Marshal.FreeHGlobal(c.CredentialBlob);
        }
    }

    public static bool Delete(string target) {
        return CredDelete(target, CRED_TYPE_GENERIC, 0);
    }
}
'@

switch ($Action) {
    'read' {
        $key = [DoorLoopCred]::Read($Target)
        if ($null -eq $key) { exit 1 }
        [Console]::Out.Write($key)
    }
    'exists' {
        if ($null -eq [DoorLoopCred]::Read($Target)) { exit 1 }
    }
    'write' {
        $key = [Console]::In.ReadToEnd().Trim()
        if (-not $key) { [Console]::Error.WriteLine('No key given.'); exit 1 }
        [DoorLoopCred]::Write($Target, $User, $key)
    }
    'delete' {
        if (-not [DoorLoopCred]::Delete($Target)) { exit 1 }
    }
}
