// Isolated public Java contracts only. No launcher, database, filesystem installer or ARU request.
import java.lang.reflect.Field;
import java.util.TreeSet;
import java.util.regex.Pattern;
import oracle.patch.pojo.PatchApply;
import oracle.patch.config.validators.TargetVersionValidation;
import oracle.patch.config.PatchConfigParameters;
import oracle.upgrade.autoupgrade.config.UpgradeConfigParameters;
import oracle.upgrade.autoupgrade.config.UpgradeConfigValidator;
import oracle.commonx.utils.pojos.ConfigParameter;

public class PatchContractProbe {
    static void names(String operation, Class<?> source) throws Exception {
        TreeSet<String> names = new TreeSet<>();
        for (Field field : source.getFields())
            if (field.getType() == ConfigParameter.class) names.add(((ConfigParameter) field.get(null)).getName());
        for (String name : names) System.out.println("PARAM\t"+operation+"\t"+name);
    }
    public static void main(String[] args) throws Exception {
        names("upgrade", UpgradeConfigParameters.class); names("patch", PatchConfigParameters.class);
        Pattern grammar=Pattern.compile("^(?:"+PatchApply.getSupportedPatchParameterPattern()+")$", Pattern.CASE_INSENSITIVE);
        for(String expression:args){
            boolean valid=grammar.matcher(expression).matches();
            String[] pieces=expression.split(":",2);
            if(valid && pieces[0].equalsIgnoreCase("GOLDIMAGE")) valid=pieces.length==2;
            else if(valid && pieces.length==2) valid=PatchApply.valueOf(pieces[0].toUpperCase()).isValidPatchParameterVersion(pieces[1]);
            System.out.println("EXPRESSION\t"+expression+"\t"+valid);
        }
        for(PatchApply type:PatchApply.values()) if(type.isSupported())
            System.out.println("DOWNLOAD\t"+type.name()+"\t"+type.isDownloadOnlyTool());
        for(PatchApply a:new PatchApply[]{PatchApply.GI,PatchApply.OEM})
            for(PatchApply b:PatchApply.values())if(b.isSupported())
                System.out.println("COMBINE\t"+a+"\t"+b+"\t"+a.canBeCombinedWith(b));
        System.out.println("NORMALIZE\t19.32.0\t"+TargetVersionValidation.getMajorVersion("19.32.0"));
        UpgradeConfigValidator validator=new UpgradeConfigValidator(null);
        for(String delay:new String[]{"0","59","60","120","2147483647"})
            System.out.println("DELAY\t"+delay+"\t"+validator.validateRacStartTimeSleepInSeconds(delay));
    }
}
