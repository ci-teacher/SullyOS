import React, { useState } from 'react';
import type { AppID } from '../../types';

type Variant = 'paper' | 'red' | 'pink' | 'map';

interface Props {
  appId: AppID | string;
  fallback: React.ReactNode;
  size?: 'sm' | 'md';
  variant?: Variant;
}

const variantClass: Record<Variant,string> = {
  paper: '',
  red: 'xp-app-icon-red',
  pink: 'xp-app-icon-pink',
  map: 'xp-app-icon-map',
};

const PrivateAppIcon: React.FC<Props> = ({ appId, fallback, size = 'md', variant = 'paper' }) => {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === 'sm' ? 'h-[58px] w-[58px] rounded-[17px]' : 'xp-app-icon';

  return (
    <div className={'relative flex shrink-0 items-center justify-center overflow-hidden ' + sizeClass + ' ' + variantClass[variant]}>
      {!failed && (
        <img
          src={'/media/private/icons/' + appId + '.png'}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <div className={'relative z-10 flex items-center justify-center ' + (variant === 'red' ? 'text-white' : 'text-[#C65C65]')}>
          {fallback}
        </div>
      )}
    </div>
  );
};

export default PrivateAppIcon;
