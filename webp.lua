function file_exists(name) --检查文件是否存在
    local f=io.open(name,"r")
    if f~=nil then io.close(f) return true else return false end
end
local originalFile = ngx.var.filename; --原文件地址
local tmpFile =ngx.var.tmp .. ngx.md5(originalFile) .. '.webp'; --缓存 webp文件地址（绝对路径）
local tmpPathFile =ngx.var.tmppath .. ngx.md5(originalFile) .. '.webp'; --缓存webp文件路径（相对路径），后续返回
-- ngx.log(ngx.ERR, executeCmd); 打印调试方法
if file_exists (tmpFile) then --判断是否有缓存文件，有就直接输出
    ngx.log(ngx.ERR, "存在缓存");
    return ngx.exec(tmpFile);
end

if not file_exists(originalFile) then -- 原文件不存在
    return  ngx.exit(404);
end
executeCmd = "cwebp -q 80 " .. originalFile  .. " -o " .. tmpFile

os.execute(executeCmd);   -- 转换原图片到 webp 格式，这里的质量是 75 ，你也可以改成别的

if file_exists(tmpFile) then -- 如果新文件存在（转换成功）
    return  ngx.exec(tmpPathFile) -- Internal Redirect
else
    ---------------------
    return  ngx.exit(404)
end
