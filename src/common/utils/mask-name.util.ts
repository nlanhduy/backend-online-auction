/**
 * Mask username để bảo mật
 * Ví dụ: "Nguyễn Văn Khoa" -> "****Khoa"
 * "Lê Minh Tuấn" -> "****Tuấn"
 * "Khoa" -> "****a"
 */
export function maskFullName(fullName: string):string{
    if(!fullName||fullName.trim().length===0) {
        return '****';
    };
    const trimmedName=fullName.trim();
    const words=trimmedName.split(' ');

    if(words.length===0){
        return '****';
    }
    const lastName=words[words.length-1];
    return `****${lastName}`;
}

export function maskFullNameAdvanced(fullName:string, charsToShow:number=4):string{
  if (!fullName || fullName.trim().length === 0) {
    return '****';
  }

  const trimmedName = fullName.trim();
  
  if (trimmedName.length <= charsToShow) {
    // Nếu tên quá ngắn, chỉ hiển thị 1 ký tự cuối
    return '****' + trimmedName.charAt(trimmedName.length - 1);
  }

  // Lấy N ký tự cuối
  const visiblePart = trimmedName.substring(trimmedName.length - charsToShow);
  return '****' + visiblePart;

}