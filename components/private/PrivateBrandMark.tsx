import React, { useState } from 'react';

const PrivateBrandMark: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className={'relative overflow-hidden rounded-[18px] bg-[#fff8e8] ' + className}>
      {!failed && (
        <img
          src="/media/private/brand/logo.png"
          alt="小手机"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex h-[72%] w-[72%] items-center justify-center rounded-[32%] bg-[#d92f4f] text-[#fff8e8] shadow-[inset_0_-3px_0_rgba(120,20,45,.12)]">
            <span className="text-[1.45em] font-black leading-none">小</span>
            <span className="absolute -right-[8%] -top-[7%] h-[28%] w-[28%] rounded-full bg-gradient-to-br from-[#f7aec8] via-[#c7b2f6] to-[#9fc9f2]" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateBrandMark;
