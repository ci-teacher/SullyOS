import React, { useState } from 'react';

const PrivateBrandMark: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [failed, setFailed] = useState(false);

  return (
    <div className={'relative overflow-hidden bg-white ' + className}>
      {!failed && (
        <img
          src="/media/private/brand/logo.png"
          alt="小手机"
          className="absolute inset-0 h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-full w-full items-center justify-center rounded-[28%] border border-[#B5ADAC]/35 bg-white text-[#B5ADAC]">
            <span className="text-[1.35em] font-black leading-none">小</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateBrandMark;
