// Original test harness. Calls only the supplied binary's file parser, not its launcher.
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.TreeSet;
import oracle.commons.config.parser.FileParser;

public final class ParserProbe {
    private static String encode(String text) {
        return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    public static void main(String[] args) throws Exception {
        for (String filename : args) {
            FileParser parser = FileParser.newByteInstance(Files.readAllBytes(Paths.get(filename)), true);
            System.out.println("RESULT\t" + filename + "\tOK");
            TreeSet<String> keys = new TreeSet<>();
            for (Object key : parser.getProperties().keySet()) keys.add((String) key);
            for (String key : keys) {
                System.out.println("VALUE\t" + filename + "\t" + encode(key) + "\t" + encode(parser.getPropertyValue(key)));
            }
        }
    }
}
