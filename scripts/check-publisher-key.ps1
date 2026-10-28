param([Parameter(Mandatory=$true)][string]$KeyPath)
$ErrorActionPreference='Stop'
$resolvedKey=[IO.Path]::GetFullPath($KeyPath)
$ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowedSids=@($ownerSid,'S-1-5-18','S-1-5-32-544')
foreach($target in @($resolvedKey,[IO.Path]::GetDirectoryName($resolvedKey))){
    $attributes=[IO.File]::GetAttributes($target)
    if(($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Signing key and its directory must not be links.'}
    if(($attributes -band [IO.FileAttributes]::Directory) -ne 0){$acl=[IO.Directory]::GetAccessControl($target)}else{$acl=[IO.File]::GetAccessControl($target)}
    foreach($rule in $acl.Access){
        if($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){continue}
        $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if($allowedSids -notcontains $sid){throw 'Signing key permissions are too broad. Restrict the key and its directory to the publishing user, SYSTEM and administrators.'}
    }
}
[Console]::WriteLine('Publisher key permissions verified; key contents were not displayed.')
