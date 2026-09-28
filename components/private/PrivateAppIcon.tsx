import React, { useState } from 'react';
import type { AppID } from '../../types';

interface Props {
  appId: AppID | string;
  fallback: React.ReactNode;
  size?: 'sm' | 'md';
  decorated?: 'none' | 'dots' | 'stripes';
}

const PrivateAppIcon: React.FC<Props> = ({ appId, fallback, size = 'md', decorated = 'none' }) => {
  const [failed, setFailed] = useState(false);
  const box = size === 'sm' ? 'h-11 w-11 rounded-[11px]' : 'xp-app-icon';
  const decoration =
    decorated === 'dots' ? 'xp-dots-gray' :
    decorated === 'stripes' ? 'xp-stripes-gray' :
    'bg-white';

  return (
    <div className={'relative flex shrink-0 items-center justify-center overflow-hidden ' + box + ' ' + decoration}>
      {!failed && (
        <img
          src={'/media/private/icons/' + appId + '.png'}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <div className="relative z-10 flex items-center justify-center text-[#B5ADAC]">
          {fallback}
        </div>
      )}
    </div>
  );
};

export default PrivateAppIcon;
