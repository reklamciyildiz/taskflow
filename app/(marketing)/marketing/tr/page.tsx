import type {Metadata} from 'next';
import MarketingPage from '../page';

const title='Actiproc — Her şey birlikte ilerler';
const description='Fikirlerini, görevlerini, süreçlerini, planlarını, notlarını ve ekip çalışmalarını Actiproc ile tek bir çalışma alanında birleştir.';
export const metadata:Metadata={
  title,description,
  keywords:['görev yönetimi','proje yönetimi','ekip iş birliği','planlayıcı','bilgi merkezi','Actiproc','iş akışı'],
  alternates:{canonical:'/marketing/tr',languages:{en:'/marketing',tr:'/marketing/tr','x-default':'/marketing'}},
  openGraph:{locale:'tr_TR',url:'/marketing/tr',title,description,siteName:'Actiproc',type:'website',
    images:[{url:'/icon-512x512.png',width:512,height:512,alt:'Actiproc'}]},
  twitter:{card:'summary_large_image',title,description,images:['/icon-512x512.png']},
};

export default function TurkishMarketingPage(){
  return <MarketingPage locale="tr"/>;
}
