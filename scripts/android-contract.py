#!/usr/bin/env python3
"""Feed this extension's synthetic export to RabbYT's actual Java importer, without modifying its repo."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--android", type=Path, default=ROOT.parent / "YTET-Android")
parser.add_argument("--json-jar", type=Path)
args = parser.parse_args()
jar = args.json_jar
if jar is None:
    candidates = sorted((Path.home() / ".gradle/caches/modules-2/files-2.1/org.json/json/20240303").glob("*/*.jar"))
    if not candidates:
        parser.error("Pass --json-jar pointing to an org.json JSON-java JAR, or prepare the Android project's Gradle dependencies first.")
    jar = candidates[0]
java = args.android / "app/src/main/java/com/ytet/android"
sources = [java / "auth/SiteSessionImport.java", java / "auth/SiteLoginPlatform.java",
           java / "core/SourcePlatform.java", java / "core/MediaUrl.java", java / "core/YoutubeUrlValidator.java"]
if not all(p.is_file() for p in sources):
    parser.error("--android must point to the RabbYT Android source repository.")
with tempfile.TemporaryDirectory(prefix="rabbyt-helper-android-contract-") as directory:
    folder = Path(directory)
    script = f"""
import {{ exportNetscape }} from {json.dumps((ROOT / 'extension/core.js').as_uri())};
const base={{domain:'.youtube.com',path:'/',value:'TEST_ONLY_NOT_A_REAL_SESSION',secure:true,httpOnly:true,hostOnly:false,session:true,storeId:'firefox-private'}};
console.log(exportNetscape([{{...base,name:'LOGIN_INFO'}},{{...base,name:'SAPISID'}},{{...base,name:'__Secure-3PAPISID',domain:'www.youtube.com',hostOnly:true,session:false,expirationDate:Math.floor(Date.now()/1000)+3600}}], 'firefox-private'));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", script], text=True, capture_output=True, check=True)
    cookie_file = folder / "synthetic-cookies.txt"
    cookie_file.write_text(result.stdout)
    runner = folder / "HelperAndroidContract.java"
    runner.write_text("""
import com.ytet.android.auth.SiteSessionImport;
import com.ytet.android.auth.SiteLoginPlatform;
import java.nio.file.*;
import org.json.*;
public class HelperAndroidContract {
    public static void main(String[] args) throws Exception {
        JSONObject data=SiteSessionImport.parse("https://www.youtube.com/",Files.readString(Path.of(args[0])));
        JSONArray cookies=data.getJSONArray("cookies");
        if(cookies.length()!=3||!SiteLoginPlatform.fromUrl("https://www.youtube.com").hasAuthentication(cookies))throw new AssertionError("login/import contract");
        boolean hostOnly=false,expiry=false;
        for(int i=0;i<cookies.length();i++){
            JSONObject cookie=cookies.getJSONObject(i);
            if(!cookie.getBoolean("http_only"))throw new AssertionError("HttpOnly");
            if(cookie.getBoolean("restorable"))throw new AssertionError("restorable");
            if(cookie.getString("name").equals("__Secure-3PAPISID")){hostOnly=!cookie.getBoolean("include_subdomains");expiry=cookie.optLong("expires")>System.currentTimeMillis()/1000;}
        }
        if(!hostOnly||!expiry)throw new AssertionError("host/expiry contract");
        System.out.println("RabbYT actual Java importer: 3 synthetic cookies accepted; authentication, HttpOnly, expiry and host-only scope verified.");
    }
}
""")
    subprocess.run(["javac", "-encoding", "UTF-8", "-cp", str(jar), "-d", str(folder), *map(str, sources), str(runner)], check=True)
    subprocess.run(["java", "-cp", str(folder) + __import__("os").pathsep + str(jar), "HelperAndroidContract", str(cookie_file)], check=True)
