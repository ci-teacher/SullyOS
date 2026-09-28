import React, { useState } from 'react';
import type { AppID } from '../../types';

type Variant = 'red-dots' | 'stripe' | 'gradient' | 'yellow' | 'mint' | 'blue' | 'paper';

const classes: Record<Variant, string> = {
  'red-dots': 'xp-dots-red text-white',
  stripe: 'xp-stripe text-[#7f2438]',
  gradient: 'xp-candy-gradient text-white',
  yellow: 'bg-[#f4d878] text-[#7c2e36]',
  mint: 'bg-[#acd7bd] text-[#304f40]',
  blue: 'bg-[#a9c8f5] text-[#35506e]',
  paper: 'bg-[#fffdf7] text-[#3b2d29] border border-black/[0.08]',
};

interface Props {
  appId: AppID | string;
  fallback: React.ReactNode;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
}

const PrivateAppIcon: React.FC<Props> = ({ appId, fallback, variant = 'paper', size = 'md' }) => {
  const [failed, setFailed] = useState(false);
  const px = size === 'lg' ? 'h-[62px] w-[62px]' : size === 'sm' ? 'h-10 w-10' : 'h-[54px] w-[54px]';

  return (
    <div className={'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[19px] xp-sticker ' + px + ' ' + classes[variant]}>
      {!failed && (
        <img
          src={'/media/private/icons/' + appId + '.png'}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {failed && <div className="relative z-10 flex items-center justify-center">{fallback}</div>}
    </div>
  );
};

export default PrivateAppIcon;
